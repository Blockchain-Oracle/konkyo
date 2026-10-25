import "server-only"
import { randomInt } from "node:crypto"
import { bylineOf } from "@konkyo/agents"
import { ROUNDS, SPACES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { readableFileSql } from "@konkyo/db/access"
import { notifyLive, revealRound, spaceEvent } from "@konkyo/db/live"
import type { RoundGround, RoundPhase, RoundQuestion, StudyItemData } from "@konkyo/db/schema"
import { enqueueAt } from "@konkyo/jobs"
import { newCard, normalizeAnswer, shuffle } from "@konkyo/study"
import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import { around } from "./articles"
import { LibraryError, readableFolderSql } from "./library"
import { hearRound } from "./live-hub"
import { type Face, faceOf } from "./profiles"
import { allowanceLeft } from "./usage"

const {
  files,
  folders,
  liveRoundAnswers,
  liveRoundPlayers,
  liveRounds,
  passages,
  profiles,
  studyCards,
  studyItems,
  studySets,
  user,
} = schema

/*
 * Study together (plan F58): a lobby with a join code, then one checked question at a time for
 * everyone at once. Answers stay face down until everyone has answered or the soft timer runs
 * out; then the bars show who picked what, with faces, and the passage the answer key was checked
 * against. The score is the team's, never a leaderboard. Questions come only from the host's own
 * sources, frozen when the round is made, so a player who joined with the code sees nothing more
 * than the round itself.
 */

/** A late answer still counts if it was sent this close to the timer's end. */
const GRACE_MS = 1_500

// ------------------------------------------------------------------ making a round

type PoolRow = {
  item: typeof studyItems.$inferSelect
  title: string
  meta: unknown
  passageText: string | null
}

/** The host's checked, live items on their own files (from a set, a space, or everything). */
async function poolFor(hostId: string, scope: { setId?: string; spaceId?: string }) {
  return (await db
    .select({
      item: studyItems,
      title: files.title,
      meta: files.meta,
      passageText: passages.text,
    })
    .from(studyItems)
    .innerJoin(files, eq(files.id, studyItems.fileId))
    .leftJoin(passages, eq(passages.id, studyItems.passageId))
    .where(
      and(
        eq(studyItems.ownerId, hostId),
        eq(studyItems.status, "active"),
        eq(files.ownerId, hostId),
        isNull(files.deletedAt),
        // an item someone kept unchecked isn't asked in front of others
        sql`coalesce((${studyItems.check}->>'unchecked')::boolean, false) = false`,
        scope.setId ? eq(studyItems.setId, scope.setId) : undefined,
        scope.spaceId
          ? sql`exists (select 1 from file_folders ff join folders fo on fo.id = ff.folder_id
              where ff.file_id = ${files.id} and fo.space_id = ${scope.spaceId}::uuid
              and fo.deleted_at is null)`
          : undefined,
      ),
    )
    .limit(600)) as PoolRow[]
}

/** An answer's meaningful words (letters and digits, longer than two characters). */
const wordsOf = (text: string) =>
  new Set(
    normalizeAnswer(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  )

/** Two answers say the same thing: equal, one inside the other, or sharing most of their words. */
function sameThing(a: string, b: string) {
  const x = normalizeAnswer(a).replace(/\s+/g, "")
  const y = normalizeAnswer(b).replace(/\s+/g, "")
  if (!x || !y || x.includes(y) || y.includes(x)) return true
  const A = wordsOf(a)
  const B = wordsOf(b)
  if (!A.size || !B.size) return false
  let shared = 0
  for (const w of A) if (B.has(w)) shared++
  return shared / Math.min(A.size, B.size) >= 0.5
}

/** One item as a multiple-choice question, or null when it can't be asked that way. */
function questionOf(row: PoolRow, recallAnswers: PoolRow[]): RoundQuestion | null {
  const { item } = row
  const data = item.data as StudyItemData
  const ground: RoundGround = {
    title: row.title,
    byline: bylineOf(row.meta as never) ?? null,
    page: item.page,
    tStart: item.tStart,
    quote: item.quote,
    context: around(row.passageText ?? item.quote, item.quote),
  }
  const base = { itemId: item.id, prompt: item.prompt, ground }
  if (item.kind === "truefalse")
    return {
      ...base,
      kind: "truefalse",
      options: [
        { id: "true", label: "true" },
        { id: "false", label: "false" },
      ],
      answer: data.isTrue === false ? "false" : "true",
    }
  if (item.kind === "compare" && data.relation)
    return {
      ...base,
      kind: "compare",
      options: [
        { id: "agree", label: "they agree" },
        { id: "disagree", label: "they disagree" },
      ],
      answer: data.relation,
    }
  if (item.kind === "recall" || item.kind === "cloze") {
    // The right answer among other answers from the same pool: never one that says the same
    // thing (a paraphrase, a longer or shorter form of it) or that the prompt gives away; the
    // same topic first, then the ones closest in length, so none stands out by its shape.
    const keys = [item.answer, ...item.accepted]
    const length = wordsOf(item.answer).size
    const candidates = recallAnswers
      .filter((r) => r.item.id !== item.id)
      .map((r) => r.item)
      .sort(
        (a, b) =>
          Number(b.topic === item.topic) - Number(a.topic === item.topic) ||
          Math.abs(wordsOf(a.answer).size - length) - Math.abs(wordsOf(b.answer).size - length) ||
          Math.random() - 0.5,
      )
    const others: string[] = []
    for (const other of candidates) {
      const label = other.answer.trim()
      if (!label || label.length > 80) continue
      if ([...keys, ...others].some((k) => sameThing(k, label))) continue
      if (normalizeAnswer(item.prompt).includes(normalizeAnswer(label))) continue
      others.push(label)
      if (others.length >= ROUNDS.choices - 1) break
    }
    if (others.length < 2) return null
    const options = shuffle([item.answer, ...others]).map((label, i) => ({
      id: String.fromCharCode(97 + i),
      label,
    }))
    const answer = options.find((o) => o.label === item.answer)?.id
    return answer ? { ...base, kind: "recall", options, answer } : null
  }
  return null
}

/** One question per passage, the kinds taking turns, in a shuffled order. */
function pickQuestions(pool: PoolRow[]) {
  const recall = pool.filter((r) => r.item.kind === "recall" || r.item.kind === "cloze")
  const byPassage = new Map<string, PoolRow[]>()
  for (const r of pool)
    byPassage.set(r.item.passageId, [...(byPassage.get(r.item.passageId) ?? []), r])
  const order = ["truefalse", "recall", "cloze", "compare"]
  const picked: RoundQuestion[] = []
  let turn = 0
  for (const group of shuffle([...byPassage.values()])) {
    if (picked.length >= ROUNDS.questions) break
    const want = order[turn++ % order.length]
    const tries = [...group.filter((r) => r.item.kind === want), ...shuffle(group)]
    for (const row of tries) {
      const question = questionOf(row, recall)
      if (question) {
        picked.push(question)
        break
      }
    }
  }
  return picked
}

const newCode = () =>
  Array.from(
    { length: ROUNDS.codeLength },
    () => ROUNDS.codeAlphabet[randomInt(ROUNDS.codeAlphabet.length)],
  ).join("")

/** Make a round from a practice set, a space, or the whole library; the host is its first player. */
export async function createRound(hostId: string, scope: { setId?: string; spaceId?: string }) {
  const [made] = await db
    .select({ n: count() })
    .from(liveRounds)
    .where(
      and(eq(liveRounds.hostId, hostId), gt(liveRounds.createdAt, sql`now() - interval '1 day'`)),
    )
  if ((made?.n ?? 0) >= ROUNDS.perDay)
    throw new LibraryError("You've started a lot of rounds today. Try again tomorrow.", 429)

  let title = "your library"
  if (scope.setId) {
    const set = await db.query.studySets.findFirst({
      where: and(eq(studySets.id, scope.setId), eq(studySets.ownerId, hostId)),
    })
    if (!set) throw new LibraryError("No such practice set", 404)
    title = set.title
  }
  if (scope.spaceId) {
    const [space] = await db
      .select({ name: folders.name })
      .from(folders)
      .where(
        and(
          eq(folders.id, scope.spaceId),
          isNull(folders.parentId),
          isNull(folders.deletedAt),
          readableFolderSql(hostId),
        ),
      )
    if (!space) throw new LibraryError("No such space", 404)
    title = space.name
  }

  const questions = pickQuestions(await poolFor(hostId, scope))
  if (questions.length < 3)
    throw new LibraryError(
      "There aren't enough checked questions on your sources here yet. Make practice first, then start a round.",
      409,
    )

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode()
    const [round] = await db
      .insert(liveRounds)
      .values({
        code,
        hostId,
        spaceId: scope.spaceId ?? null,
        setId: scope.setId ?? null,
        title,
        questions,
        seconds: ROUNDS.secondsPerQuestion,
      })
      .onConflictDoNothing()
      .returning({ id: liveRounds.id, code: liveRounds.code })
    if (!round) continue
    await db.insert(liveRoundPlayers).values({ roundId: round.id, userId: hostId })
    hearRound(hostId, round.id)
    // the space's members hear of it (a toast, and the "live round" strip on the wall)
    if (scope.spaceId)
      await spaceEvent(db, {
        spaceId: scope.spaceId,
        actorId: hostId,
        kind: "round_started",
        subjectId: round.id,
      })
    return round
  }
  throw new LibraryError("Couldn't make a code. Try again.", 500)
}

// ------------------------------------------------------------------ joining and reading

async function roundById(roundId: string) {
  const round = await db.query.liveRounds.findFirst({ where: eq(liveRounds.id, roundId) })
  if (!round) throw new LibraryError("No such round", 404)
  return round
}

async function isPlayer(roundId: string, userId: string) {
  const row = await db.query.liveRoundPlayers.findFirst({
    where: and(eq(liveRoundPlayers.roundId, roundId), eq(liveRoundPlayers.userId, userId)),
  })
  return Boolean(row)
}

/*
 * Wrong codes, counted per person and per address in this process (the web app runs as one): a
 * code is the only way into someone's round, so guessing them is slowed to a crawl.
 */
const misses = new Map<string, { n: number; until: number }>()
function tooManyMisses(keys: string[]) {
  const now = Date.now()
  return keys.some((k) => {
    const m = misses.get(k)
    return m && m.until > now && m.n >= ROUNDS.joinMisses
  })
}
function missed(keys: string[]) {
  const now = Date.now()
  for (const k of keys) {
    const m = misses.get(k)
    misses.set(
      k,
      m && m.until > now
        ? { n: m.n + 1, until: m.until }
        : { n: 1, until: now + ROUNDS.joinMissWindowMinutes * 60_000 },
    )
  }
  if (misses.size > 10_000) for (const [k, m] of misses) if (m.until <= now) misses.delete(k)
}

const NO_ROUND = "No round has that code, or it has finished. Check it and try again."

/**
 * The join code's round: sit down in it (again is fine) and start hearing it live. An unknown and
 * a finished code read the same, so a reply never says a code once existed.
 */
export async function joinByCode(userId: string, rawCode: string, visitor: string | null) {
  const keys = [`u:${userId}`, ...(visitor ? [`v:${visitor}`] : [])]
  if (tooManyMisses(keys))
    throw new LibraryError("Too many wrong codes. Wait a few minutes and try again.", 429)
  const code = rawCode.trim().toUpperCase()
  const round = await db.query.liveRounds.findFirst({ where: eq(liveRounds.code, code) })
  if (!round) {
    missed(keys)
    throw new LibraryError(NO_ROUND, 404)
  }
  if (await isPlayer(round.id, userId)) return { id: round.id, code: round.code }
  if (round.phase === "done" || idle(round)) {
    missed(keys)
    throw new LibraryError(NO_ROUND, 404)
  }
  // one seat at a time: the round's row is locked while the seats are counted
  const seated = await db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from live_rounds where id = ${round.id}::uuid for update`)
    const [taken] = await tx
      .select({ n: count() })
      .from(liveRoundPlayers)
      .where(eq(liveRoundPlayers.roundId, round.id))
    if ((taken?.n ?? 0) >= ROUNDS.maxPlayers) return false
    await tx.insert(liveRoundPlayers).values({ roundId: round.id, userId }).onConflictDoNothing()
    await tx.update(liveRounds).set({ updatedAt: new Date() }).where(eq(liveRounds.id, round.id))
    return true
  })
  if (!seated) throw new LibraryError(`That round is full (${ROUNDS.maxPlayers} players).`, 409)
  hearRound(userId, round.id)
  await notifyLive(`round:${round.id}`, "players", {})
  return { id: round.id, code: round.code }
}

/** A round with no activity (a join, an answer, a move) for a while is over, whatever its phase. */
const idle = (round: { updatedAt: Date }) =>
  Date.now() - round.updatedAt.getTime() > ROUNDS.idleMinutes * 60_000

/**
 * The round going on in a space now, for its members (the space's button), or the one an event
 * named (the toast's join).
 */
export async function activeRoundIn(userId: string, spaceId: string, roundId?: string) {
  const [space] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, spaceId), isNull(folders.deletedAt), readableFolderSql(userId)))
  if (!space) throw new LibraryError("No such space", 404)
  const round = await db.query.liveRounds.findFirst({
    where: and(
      eq(liveRounds.spaceId, spaceId),
      sql`${liveRounds.phase} <> 'done'`,
      roundId ? eq(liveRounds.id, roundId) : undefined,
    ),
    orderBy: sql`${liveRounds.createdAt} desc`,
  })
  if (!round || idle(round)) return null
  const [host, profile, [seated]] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, round.hostId) }),
    db.query.profiles.findFirst({ where: eq(profiles.userId, round.hostId) }),
    db.select({ n: count() }).from(liveRoundPlayers).where(eq(liveRoundPlayers.roundId, round.id)),
  ])
  return {
    code: round.code,
    title: round.title,
    phase: round.phase,
    players: seated?.n ?? 0,
    host: host ? faceOf(host, profile) : null,
  }
}

export type RoundPlayer = { userId: string; face: Face; answered: boolean; host: boolean }

export type RoundView = {
  id: string
  code: string
  title: string
  color: string
  /** The wall the round is played on: its space's, or violet. */
  wall: string
  phase: RoundPhase
  at: number
  total: number
  version: number
  seconds: number
  endsAt: string | null
  /** The server's clock, so a phone's timer counts down from the same moment. */
  now: string
  youHost: boolean
  players: RoundPlayer[]
  question: {
    kind: RoundQuestion["kind"]
    prompt: string
    options: { id: string; label: string }[]
    mine: string | null
    /** Face up only: the right option, who picked what, and the passage behind the answer. */
    answer?: string
    tally?: { optionId: string; faces: Face[] }[]
    ground?: RoundGround
  } | null
  /** The team so far: right answers out of answers given, over the questions turned face up. */
  team: { right: number; answers: number }
  recap?: {
    questions: {
      prompt: string
      answer: string
      right: number
      answers: number
      mine: { label: string; right: boolean } | null
      ground: RoundGround
    }[]
    missed: number
    canPractise: boolean
  }
}

/** What a player sees now. Only players see a round (the code is the way in). */
export async function roundView(userId: string, roundId: string): Promise<RoundView> {
  const round = await roundById(roundId)
  if (!(await isPlayer(roundId, userId))) throw new LibraryError("Join with the code first", 403)
  const [seated, answers, space] = await Promise.all([
    db
      .select({ person: user, profile: profiles, joinedAt: liveRoundPlayers.joinedAt })
      .from(liveRoundPlayers)
      .innerJoin(user, eq(user.id, liveRoundPlayers.userId))
      .leftJoin(profiles, eq(profiles.userId, liveRoundPlayers.userId))
      .where(eq(liveRoundPlayers.roundId, roundId))
      .orderBy(liveRoundPlayers.joinedAt),
    db.select().from(liveRoundAnswers).where(eq(liveRoundAnswers.roundId, roundId)),
    round.spaceId
      ? db.query.folders.findFirst({
          where: eq(folders.id, round.spaceId),
          columns: { color: true, wall: true },
        })
      : Promise.resolve(undefined),
  ])
  const faces = new Map(seated.map((s) => [s.person.id, faceOf(s.person, s.profile)]))
  const faceUp = round.phase === "reveal" || round.phase === "done"
  const now = answers.filter((a) => a.at === round.at)
  const question = round.phase === "lobby" ? null : round.questions[round.at]
  // the team's score counts questions already turned face up
  const counted = answers.filter((a) => a.at < round.at || (a.at === round.at && faceUp))

  const view: RoundView = {
    id: round.id,
    code: round.code,
    title: round.title,
    color: SPACES.colors[(space?.color as keyof typeof SPACES.colors) ?? "violet"].hex,
    wall: space?.wall ?? "violet",
    phase: round.phase,
    at: round.at,
    total: round.questions.length,
    version: round.version,
    seconds: round.seconds,
    endsAt: round.endsAt?.toISOString() ?? null,
    now: new Date().toISOString(),
    youHost: round.hostId === userId,
    players: seated.map((s) => ({
      userId: s.person.id,
      face: faces.get(s.person.id) as Face,
      answered: now.some((a) => a.userId === s.person.id),
      host: s.person.id === round.hostId,
    })),
    question: question
      ? {
          kind: question.kind,
          prompt: question.prompt,
          options: question.options,
          mine: now.find((a) => a.userId === userId)?.choice ?? null,
          ...(faceUp
            ? {
                answer: question.answer,
                ground: question.ground,
                tally: question.options.map((o) => ({
                  optionId: o.id,
                  faces: now
                    .filter((a) => a.choice === o.id)
                    .map((a) => faces.get(a.userId))
                    .filter((f): f is Face => Boolean(f)),
                })),
              }
            : {}),
        }
      : null,
    team: { right: counted.filter((a) => a.right).length, answers: counted.length },
  }

  if (round.phase === "done") {
    const recap = round.questions.map((q, i) => {
      const given = answers.filter((a) => a.at === i)
      const mine = given.find((a) => a.userId === userId)
      return {
        prompt: q.prompt,
        answer: q.options.find((o) => o.id === q.answer)?.label ?? "",
        right: given.filter((a) => a.right).length,
        answers: given.length,
        mine: mine
          ? {
              label: q.options.find((o) => o.id === mine.choice)?.label ?? mine.choice,
              right: mine.right,
            }
          : null,
        ground: q.ground,
      }
    })
    const missedIds = missedItems(round.questions, answers)
    view.recap = {
      questions: recap,
      missed: missedIds.length,
      canPractise:
        missedIds.length > 0 &&
        (round.hostId === userId || (await readableItems(userId, missedIds)).length > 0),
    }
  }
  return view
}

/** Questions somebody missed or nobody answered: what "review the ones we missed" practises. */
function missedItems(
  questions: RoundQuestion[],
  answers: (typeof liveRoundAnswers.$inferSelect)[],
) {
  return questions
    .filter((_, i) => {
      const given = answers.filter((a) => a.at === i)
      return !given.length || given.some((a) => !a.right)
    })
    .map((q) => q.itemId)
}

// ------------------------------------------------------------------ moving the round on

/** The host starts it: the first question, face down, with its timer. */
export async function startRound(hostId: string, roundId: string) {
  const [started] = await db
    .update(liveRounds)
    .set({
      phase: "question",
      at: 0,
      version: sql`${liveRounds.version} + 1`,
      startedAt: new Date(),
      endsAt: sql`now() + make_interval(secs => ${liveRounds.seconds})`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(liveRounds.id, roundId), eq(liveRounds.hostId, hostId), eq(liveRounds.phase, "lobby")),
    )
    .returning({ version: liveRounds.version, endsAt: liveRounds.endsAt })
  if (!started) throw new LibraryError("Only the host can start it, once", 409)
  await announce(roundId, started.version, started.endsAt)
}

/**
 * The host moves on from a face-up question: the next one, or the recap after the last. The next
 * position is worked out in the update itself, from the row as it is.
 */
export async function nextQuestion(hostId: string, roundId: string, version: number) {
  const rows = await db.execute<{
    version: number
    ends_at: string | null
    phase: RoundPhase
    space_id: string | null
  }>(sql`
    update live_rounds set
      phase = case when at + 1 >= jsonb_array_length(questions) then 'done' else 'question' end,
      at = case when at + 1 >= jsonb_array_length(questions) then at else at + 1 end,
      ends_at = case when at + 1 >= jsonb_array_length(questions) then null
        else now() + make_interval(secs => seconds) end,
      ended_at = case when at + 1 >= jsonb_array_length(questions) then now() else ended_at end,
      version = version + 1,
      updated_at = now()
    where id = ${roundId}::uuid and host_id = ${hostId} and version = ${version}
      and phase = 'reveal'
    returning version, ends_at, phase, space_id`)
  const moved = rows[0]
  if (!moved) return
  await announce(roundId, moved.version, moved.ends_at ? new Date(moved.ends_at) : null)
  if (moved.phase === "done" && moved.space_id)
    await spaceEvent(db, {
      spaceId: moved.space_id,
      actorId: hostId,
      kind: "round_ended",
      subjectId: roundId,
    })
}

/** The host ends it early: straight to the recap. */
export async function endRound(hostId: string, roundId: string) {
  const [ended] = await db
    .update(liveRounds)
    .set({
      phase: "done",
      version: sql`${liveRounds.version} + 1`,
      endsAt: null,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(liveRounds.id, roundId),
        eq(liveRounds.hostId, hostId),
        sql`${liveRounds.phase} <> 'done'`,
      ),
    )
    .returning({ version: liveRounds.version, spaceId: liveRounds.spaceId })
  if (!ended) return
  await notifyLive(`round:${roundId}`, "round", { v: ended.version })
  if (ended.spaceId)
    await spaceEvent(db, {
      spaceId: ended.spaceId,
      actorId: hostId,
      kind: "round_ended",
      subjectId: roundId,
    })
}

/** Tell the players, and set the worker's tick for a question's timer. */
async function announce(roundId: string, version: number, endsAt: Date | null) {
  await notifyLive(`round:${roundId}`, "round", { v: version })
  if (endsAt) await enqueueAt("roundTick", { roundId, version }, endsAt)
}

/**
 * An answer, face down. The first answer to a question stands. It lands only while that question
 * is still face down (checked in the insert itself, so a reveal in between can't let it in late);
 * when the last player answers, the question turns face up at once.
 */
export async function answerQuestion(
  userId: string,
  roundId: string,
  input: { at: number; choice: string },
) {
  const round = await roundById(roundId)
  const question = round.questions[input.at]
  if (!question) throw new LibraryError("No such question", 400)
  if (!question.options.some((o) => o.id === input.choice))
    throw new LibraryError("That isn't one of the options", 400)
  const inserted = await db.execute<{ at: number }>(sql`
    insert into live_round_answers (round_id, at, user_id, choice, "right", ms)
    select r.id, ${input.at}, ${userId}, ${input.choice}, ${input.choice === question.answer},
      greatest(0, (extract(epoch from now() - (r.ends_at - make_interval(secs => r.seconds)))
        * 1000)::int)
    from live_rounds r
    where r.id = ${roundId}::uuid and r.phase = 'question' and r.at = ${input.at}
      and r.ends_at + make_interval(secs => ${GRACE_MS / 1000}) > now()
      and exists (select 1 from live_round_players p
        where p.round_id = r.id and p.user_id = ${userId})
    on conflict do nothing
    returning at`)
  if (!inserted.length) {
    if (!(await isPlayer(roundId, userId))) throw new LibraryError("Join with the code first", 403)
    const already = await db.query.liveRoundAnswers.findFirst({
      where: and(
        eq(liveRoundAnswers.roundId, roundId),
        eq(liveRoundAnswers.at, input.at),
        eq(liveRoundAnswers.userId, userId),
      ),
    })
    if (already) return // a repeat: the first answer stands, nobody needs telling again
    throw new LibraryError("That question is already face up", 409)
  }
  await db.update(liveRounds).set({ updatedAt: new Date() }).where(eq(liveRounds.id, roundId))
  const [[given], [seated]] = await Promise.all([
    db
      .select({ n: count() })
      .from(liveRoundAnswers)
      .where(and(eq(liveRoundAnswers.roundId, roundId), eq(liveRoundAnswers.at, input.at))),
    db.select({ n: count() }).from(liveRoundPlayers).where(eq(liveRoundPlayers.roundId, roundId)),
  ])
  if ((given?.n ?? 0) >= (seated?.n ?? 0)) await revealRound(roundId, round.version, true)
  else await notifyLive(`round:${roundId}`, "answered", { at: input.at })
}

/** A player's timer hit zero: turn the question face up (the worker's tick does it too). */
export async function timeUp(userId: string, roundId: string, version: number) {
  if (!(await isPlayer(roundId, userId))) throw new LibraryError("Join with the code first", 403)
  await revealRound(roundId, version)
}

// ------------------------------------------------------------------ after the round

/**
 * The missed items this person may practise: checked ones (never one its owner kept unchecked),
 * whose source they can open, and, for a comparison, whose second source they can open too.
 */
async function readableItems(userId: string, itemIds: string[]) {
  if (!itemIds.length) return []
  const rows = await db
    .select({ item: studyItems })
    .from(studyItems)
    .innerJoin(files, eq(files.id, studyItems.fileId))
    .where(
      and(
        inArray(studyItems.id, itemIds),
        eq(studyItems.status, "active"),
        isNull(files.deletedAt),
        sql`coalesce((${studyItems.check}->>'unchecked')::boolean, false) = false`,
        readableFileSql(userId, "files"),
      ),
    )
  const others = [
    ...new Set(
      rows
        .map((r) => (r.item.data as StudyItemData).other?.fileId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const open = new Set(
    others.length
      ? (
          await db
            .select({ id: files.id })
            .from(files)
            .where(
              and(
                inArray(files.id, others),
                isNull(files.deletedAt),
                readableFileSql(userId, "files"),
              ),
            )
        ).map((f) => f.id)
      : [],
  )
  return rows.filter((r) => {
    const other = (r.item.data as StudyItemData).other?.fileId
    return !other || open.has(other)
  })
}

/**
 * "Review the ones we missed": the host practises their own items; another player gets a copy of
 * the ones whose source they can open (a member of the space), as a practice set of their own.
 */
export async function practiseMissed(userId: string, roundId: string) {
  const round = await roundById(roundId)
  if (!(await isPlayer(roundId, userId))) throw new LibraryError("Join with the code first", 403)
  if (round.phase !== "done") throw new LibraryError("The round isn't over yet", 409)
  const answers = await db
    .select()
    .from(liveRoundAnswers)
    .where(eq(liveRoundAnswers.roundId, roundId))
  const missed = missedItems(round.questions, answers)
  const items = await readableItems(userId, missed)
  if (!items.length)
    throw new LibraryError("These questions come from sources you can't open on your own.", 403)
  if (round.hostId === userId)
    return {
      href: `/study/session?mode=quiz&ids=${items.map((i) => i.item.id).join(",")}`,
    }
  const title = `Missed in “${round.title}”`.slice(0, 120)
  const setId = await db.transaction(async (tx) => {
    // once per round and player: a second tap opens the same set
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`practise:${roundId}:${userId}`}))`,
    )
    const [made] = await tx
      .select({ id: studySets.id })
      .from(studySets)
      .where(
        and(
          eq(studySets.ownerId, userId),
          eq(studySets.title, title),
          gt(studySets.createdAt, round.endedAt ?? round.createdAt),
        ),
      )
      .limit(1)
    if (made) return made.id
    const limited = await allowanceLeft(userId, "practiceSets")
    if (limited) throw new LibraryError(limited, 429)
    const [set] = await tx
      .insert(studySets)
      .values({
        ownerId: userId,
        title,
        scope: { fileIds: [...new Set(items.map((i) => i.item.fileId))], folderIds: [] },
        status: "ready",
        made: items.length,
      })
      .returning({ id: studySets.id })
    if (!set) throw new LibraryError("Couldn't make the set", 500)
    const copies = await tx
      .insert(studyItems)
      .values(
        items.map(({ item }) => {
          const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = item
          return { ...rest, ownerId: userId, setId: set.id }
        }),
      )
      .returning({ id: studyItems.id })
    const now = new Date()
    await tx
      .insert(studyCards)
      .values(copies.map((c) => ({ itemId: c.id, ownerId: userId, ...newCard(now) })))
    return set.id
  })
  return { href: `/study/session?mode=quiz&set=${setId}` }
}

/** Rounds this person can start from: their sets with checked items, newest first (the picker). */
export async function roundSources(userId: string) {
  return db
    .select({ id: studySets.id, title: studySets.title, made: studySets.made })
    .from(studySets)
    .where(and(eq(studySets.ownerId, userId), eq(studySets.status, "ready")))
    .orderBy(sql`${studySets.createdAt} desc`)
    .limit(12)
}
