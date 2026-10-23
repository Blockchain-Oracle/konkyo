import "server-only"
import {
  bylineOf,
  checkEdit,
  gradeAnswer,
  type ItemForCheck,
  makeItems,
  makeNotes,
  quoteKey,
  recheckItem,
  recordWrongItem,
  type StudyPassage,
  Tracer,
} from "@konkyo/agents"
import { type FileKind, type FileMeta, STUDY } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import type { StudyCheck, StudyItemData, StudyKind, StudyMode, StudyScope } from "@konkyo/db/schema"
import { enqueue } from "@konkyo/jobs"
import {
  type CardState,
  dayIn,
  formatInterval,
  freezesAfter,
  GRADES,
  type GradeValue,
  interleave,
  isMilestone,
  newCard,
  type Outcome,
  preview,
  quickGrade,
  REPAIR_ROUNDS,
  review,
  shuffle,
  streakOf,
} from "@konkyo/study"
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { LibraryError } from "./library"
import { createNote } from "./notes"
import { allowanceLeft } from "./usage"

const { studySets, studyItems, studyCards, studyReviews, studyRounds, studyDays, files } = schema
const { userSettings, passages, fileFolders, folders } = schema

// ------------------------------------------------------------------ settings and days

async function studyPrefs(ownerId: string) {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, ownerId),
  })
  return {
    timeZone: row?.timeZone ?? "UTC",
    freezes: row?.streakFreezes ?? 2,
    dailyNew: row?.dailyNew ?? 15,
    sound: row?.studySound ?? true,
  }
}

async function savePrefs(
  ownerId: string,
  patch: Partial<{ timeZone: string; streakFreezes: number }>,
) {
  await db
    .insert(userSettings)
    .values({ userId: ownerId, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch })
}

const validZone = (zone: string | undefined) => {
  if (!zone) return undefined
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone })
    return zone
  } catch {
    return undefined
  }
}

/** The person's day boundaries, computed in Postgres (it knows every time zone's rules). */
async function dayBounds(timeZone: string) {
  const [row] = await db.execute<{ start: string; end: string; tomorrow: string }>(sql`
    select (date_trunc('day', now() at time zone ${timeZone})) at time zone ${timeZone} as start,
      (date_trunc('day', now() at time zone ${timeZone}) + interval '1 day') at time zone ${timeZone} as end,
      (date_trunc('day', now() at time zone ${timeZone}) + interval '2 day') at time zone ${timeZone} as tomorrow
  `)
  return {
    start: new Date(row?.start ?? Date.now()),
    end: new Date(row?.end ?? Date.now()),
    tomorrow: new Date(row?.tomorrow ?? Date.now()),
  }
}

// ------------------------------------------------------------------ streaks (F31)

export type StreakView = {
  current: number
  doneToday: boolean
  week: { day: string; kind: "done" | "freeze" | "repair" | null; today: boolean }[]
  freezes: number
  /** A recently broken streak, and how many more rounds today bring it back. */
  repair: { streak: number; roundsLeft: number } | null
}

/**
 * The streak as of today, with any missed days a held freeze covers stored (and the freezes
 * spent), so the streak a person sees is the one they have.
 */
async function settleStreak(ownerId: string, timeZone: string, freezes: number) {
  const today = dayIn(new Date(), timeZone)
  const load = () =>
    db
      .select({ day: studyDays.day, kind: studyDays.kind })
      .from(studyDays)
      .where(eq(studyDays.ownerId, ownerId))
      .orderBy(desc(studyDays.day))
      .limit(400)
  let days = await load()
  let s = streakOf(days, today, freezes)
  if (s.toFreeze.length) {
    await db
      .insert(studyDays)
      .values(s.toFreeze.map((day) => ({ ownerId, day, kind: "freeze" as const })))
      .onConflictDoNothing()
    freezes -= s.toFreeze.length
    await savePrefs(ownerId, { streakFreezes: freezes })
    days = await load()
    s = streakOf(days, today, freezes)
  }
  return { s, today, freezes, days }
}

async function roundsToday(ownerId: string, today: string) {
  const [row] = await db
    .select({ n: count() })
    .from(studyRounds)
    .where(
      and(
        eq(studyRounds.ownerId, ownerId),
        eq(studyRounds.day, today),
        eq(studyRounds.counted, true),
      ),
    )
  return row?.n ?? 0
}

async function streakView(
  ownerId: string,
  s: ReturnType<typeof streakOf>,
  freezes: number,
  today: string,
): Promise<StreakView> {
  const rounds = s.repair ? await roundsToday(ownerId, today) : 0
  return {
    current: s.current,
    doneToday: s.doneToday,
    week: s.week,
    freezes,
    repair: s.repair
      ? { streak: s.repair.streak, roundsLeft: Math.max(0, REPAIR_ROUNDS - rounds) }
      : null,
  }
}

// ------------------------------------------------------------------ today (Home + Study)

export type TodaySummary = {
  hasItems: boolean
  /** Due reviews plus today's share of new items. */
  due: number
  reviews: number
  fresh: number
  files: number
  next: { at: string; count: number } | null
  streak: StreakView
  sound: boolean
}

/** New items first practised today (they count against the day's share of new ones). */
async function newToday(ownerId: string, start: Date) {
  const [row] = await db.execute<{ n: number }>(sql`
    select count(distinct r.item_id)::int as n from study_reviews r
    where r.owner_id = ${ownerId} and r.created_at >= ${start.toISOString()}
      and not exists (
        select 1 from study_reviews e where e.item_id = r.item_id and e.created_at < ${start.toISOString()}
      )
  `)
  return row?.n ?? 0
}

const liveItems = (ownerId: string) =>
  and(eq(studyItems.ownerId, ownerId), eq(studyItems.status, "active"), isNull(files.deletedAt))

export async function todaySummary(ownerId: string): Promise<TodaySummary> {
  const prefs = await studyPrefs(ownerId)
  const { start, end } = await dayBounds(prefs.timeZone)
  const rows = await db
    .select({
      passageId: studyItems.passageId,
      fileId: studyItems.fileId,
      state: studyCards.state,
      due: studyCards.due,
      createdAt: studyItems.createdAt,
    })
    .from(studyItems)
    .innerJoin(studyCards, eq(studyCards.itemId, studyItems.id))
    .innerJoin(files, eq(files.id, studyItems.fileId))
    .where(liveItems(ownerId))
  const quota = Math.max(0, prefs.dailyNew - (await newToday(ownerId, start)))
  const queued = onePerPassage(
    [
      ...rows.filter((r) => r.state !== 0 && r.due < end),
      ...rows
        .filter((r) => r.state === 0)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, quota),
    ],
    (r) => r,
    STUDY.reviewRoundMax,
    new Date(),
  )
  const reviews = queued.filter((r) => r.state !== 0).length
  const fresh = queued.length - reviews
  const counts = { items: rows.length, files: new Set(queued.map((r) => r.fileId)).size }
  let next: TodaySummary["next"] = null
  if (!reviews && !fresh && counts.items) {
    const [soonest] = await db
      .select({ due: studyCards.due })
      .from(studyCards)
      .innerJoin(studyItems, eq(studyItems.id, studyCards.itemId))
      .innerJoin(files, eq(files.id, studyItems.fileId))
      .where(and(liveItems(ownerId), sql`${studyCards.state} <> 0`))
      .orderBy(studyCards.due)
      .limit(1)
    if (soonest) {
      const { end: dayEnd } = await dayBoundsOf(prefs.timeZone, soonest.due)
      const [due] = await db
        .select({ n: count() })
        .from(studyCards)
        .innerJoin(studyItems, eq(studyItems.id, studyCards.itemId))
        .innerJoin(files, eq(files.id, studyItems.fileId))
        .where(
          and(
            liveItems(ownerId),
            sql`${studyCards.state} <> 0 and ${studyCards.due} < ${dayEnd.toISOString()}`,
          ),
        )
      next = { at: soonest.due.toISOString(), count: due?.n ?? 0 }
    }
  }
  const { s, today, freezes } = await settleStreak(ownerId, prefs.timeZone, prefs.freezes)
  return {
    hasItems: counts.items > 0,
    due: reviews + fresh,
    reviews,
    fresh,
    files: counts.files,
    next,
    streak: await streakView(ownerId, s, freezes, today),
    sound: prefs.sound,
  }
}

/** The end of the person's day that contains `at`. */
async function dayBoundsOf(timeZone: string, at: Date) {
  const [row] = await db.execute<{ end: string }>(sql`
    select (date_trunc('day', ${at.toISOString()}::timestamptz at time zone ${timeZone}) + interval '1 day') at time zone ${timeZone} as end
  `)
  return { end: new Date(row?.end ?? at) }
}

// ------------------------------------------------------------------ sets (F27)

function scopeIds(scope: StudyScope) {
  return { fileIds: [...new Set(scope.fileIds)], folderIds: [...new Set(scope.folderIds)] }
}

/** A set's name: the file or folder it's made from, or how many. */
async function titleFor(ownerId: string, scope: StudyScope) {
  if (scope.fileIds.length === 1 && !scope.folderIds.length) {
    const file = await db.query.files.findFirst({
      where: and(eq(files.id, scope.fileIds[0] as string), eq(files.ownerId, ownerId)),
    })
    if (!file || file.deletedAt) throw new LibraryError("No such file", 404)
    if (file.kind === "note")
      throw new LibraryError("Practice is made from sources, not notes", 400)
    if (file.status !== "ready") throw new LibraryError("That file is still being read", 409)
    return file.title
  }
  if (scope.folderIds.length === 1 && !scope.fileIds.length) {
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, scope.folderIds[0] as string), eq(folders.ownerId, ownerId)),
    })
    if (!folder || folder.deletedAt) throw new LibraryError("No such folder", 404)
    return folder.name
  }
  const n = scope.fileIds.length + scope.folderIds.length
  return n ? `${n} files and folders` : "Your library"
}

export async function createSet(ownerId: string, input: { scope: StudyScope; title?: string }) {
  const limited = await allowanceLeft(ownerId, "practiceSets")
  if (limited) throw new LibraryError(limited, 429)
  const scope = scopeIds(input.scope)
  const title = input.title?.trim() || (await titleFor(ownerId, scope))
  const id = crypto.randomUUID()
  await db.insert(studySets).values({ id, ownerId, title, scope, runId: `study-${id}` })
  await enqueue("study", { setId: id })
  return { id }
}

export type SetSummary = {
  id: string
  title: string
  status: "generating" | "ready" | "failed"
  problem: string | null
  passages: number
  made: number
  dropped: number
  items: number
  due: number
  fresh: number
  kinds: Record<string, number>
  createdAt: string
}

export async function listSets(ownerId: string, id?: string): Promise<SetSummary[]> {
  const rows = await db.execute<{
    id: string
    title: string
    status: SetSummary["status"]
    problem: string | null
    passages: number
    made: number
    dropped: number
    created_at: string
    items: number
    due: number
    fresh: number
    kinds: Record<string, number> | null
  }>(sql`
    select s.id, s.title, s.status, s.problem, s.passages, s.made, s.dropped, s.created_at,
      count(i.id)::int as items,
      (count(*) filter (where c.state <> 0 and c.due <= now()))::int as due,
      (count(*) filter (where c.state = 0))::int as fresh,
      (select jsonb_object_agg(k.kind, k.n) from (
        select kind, count(*)::int as n from study_items
        where set_id = s.id and status = 'active' group by kind
        union all
        select 'evidence', count(*)::int from study_items
        where set_id = s.id and status = 'active'
          and jsonb_array_length(coalesce(data->'distractors', '[]'::jsonb)) > 0
      ) k) as kinds
    from study_sets s
    left join study_items i on i.set_id = s.id and i.status = 'active'
      and exists (select 1 from files f where f.id = i.file_id and f.deleted_at is null)
    left join study_cards c on c.item_id = i.id
    where s.owner_id = ${ownerId} ${id ? sql`and s.id = ${id}::uuid` : sql``}
    group by s.id
    order by s.created_at desc
    limit 100
  `)
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    problem: r.problem,
    passages: r.passages,
    made: r.made,
    dropped: r.dropped,
    items: r.items,
    due: r.due,
    fresh: r.fresh,
    kinds: r.kinds ?? {},
    createdAt: new Date(r.created_at).toISOString(),
  }))
}

export async function getSet(ownerId: string, id: string) {
  const [set] = await listSets(ownerId, id)
  if (!set) throw new LibraryError("No such practice set", 404)
  return set
}

export async function deleteSet(ownerId: string, id: string) {
  await db.delete(studySets).where(and(eq(studySets.id, id), eq(studySets.ownerId, ownerId)))
}

// ------------------------------------------------------------------ rounds (F28, F30)

export type RoundGround = {
  fileId: string
  title: string
  kind: FileKind
  passageId: string
  page: number | null
  tStart: number | null
  quote: string
  byline?: string
}

export type RoundOption = RoundGround & { excerpt: string }

export type CompareSide = RoundGround & { sentences: string[]; answers: number[] }

export type RoundItem = {
  id: string
  kind: StudyKind | "evidence"
  topic: string
  prompt: string
  answer: string
  accepted: string[]
  hints: string[]
  why: string
  ground: RoundGround
  isTrue?: boolean
  original?: string
  steps?: string[]
  shuffled?: string[]
  options?: RoundOption[]
  relation?: "agree" | "disagree"
  sides?: { a: CompareSide; b: CompareSide }
  unchecked?: boolean
  /** When each grade would bring it back ("1d", "3d"...), for the grade buttons. */
  intervals: Record<GradeValue, string>
  isNew: boolean
}

export type Round = { roundId: string; mode: StudyMode; title: string; items: RoundItem[] }

type Row = {
  item: typeof studyItems.$inferSelect
  card: typeof studyCards.$inferSelect
  title: string
  fileKind: FileKind
  meta: FileMeta | null
}

const GAME_KINDS: Partial<Record<StudyMode, StudyKind[]>> = {
  recall: ["recall", "cloze"],
  fix: ["truefalse"],
  evidence: ["recall", "truefalse"],
  order: ["order"],
  compare: ["compare"],
}

/** Find the Evidence asks only items whose wrong options were chosen and checked when made. */
const asksEvidence = (item: Row["item"]) =>
  Boolean((item.data as StudyItemData).distractors?.length)

const cardOf = (c: typeof studyCards.$inferSelect): CardState => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  scheduledDays: c.scheduledDays,
  learningSteps: c.learningSteps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  lastReview: c.lastReview,
})

const SENTENCE = /(?<=[.!?…])\s+(?=[A-Z0-9“"(‘'])/

/** A short window of a passage: around its quote, or its opening, cut at sentence ends. */
function excerptOf(text: string, quote?: string, size = 340) {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= size) return flat
  let at = 0
  if (quote) {
    const index = flat
      .toLowerCase()
      .indexOf(quote.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40))
    if (index > 0) at = Math.max(0, index - Math.round((size - Math.min(quote.length, size)) / 2))
  }
  let start = at
  if (start > 0) {
    const boundary = flat.slice(0, start).search(/[.!?]\s+[^.!?]*$/)
    start = boundary === -1 ? start : boundary + 2
  }
  const out = flat.slice(start, start + size)
  const end = out.search(/[.!?](?=[^.!?]*$)/)
  return `${start > 0 ? "… " : ""}${end > size * 0.6 ? out.slice(0, end + 1) : `${out.trimEnd()} …`}`
}

const wordsOf = (text: string) => new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? [])

/**
 * The sentence of a passage closest to a claim (most words in common), so a Find the Evidence
 * distractor is shown around its most similar sentence, just as the right one is shown around
 * its quote: every option looks alike, and none gives itself away by where it starts.
 */
function nearestSentence(text: string, claim: string) {
  const want = wordsOf(claim)
  let best = ""
  let score = -1
  for (const sentence of text.replace(/\s+/g, " ").split(SENTENCE)) {
    const shared = [...wordsOf(sentence)].filter((w) => want.has(w)).length
    if (shared > score) {
      best = sentence
      score = shared
    }
  }
  return best
}

function sidesOf(text: string, quote: string) {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(SENTENCE)
    .map((s) => s.trim())
    .filter(Boolean)
  const q = quoteKey(quote)
  const answers = sentences.flatMap((s, i) => {
    const k = quoteKey(s)
    return k.length > 6 && (q.includes(k) || k.includes(q.slice(0, Math.min(q.length, 24))))
      ? [i]
      : []
  })
  return { sentences, answers }
}

async function passageTexts(ids: string[]) {
  if (!ids.length) return new Map<string, { text: string; ordinal: number; fileId: string }>()
  const rows = await db
    .select({
      id: passages.id,
      text: passages.text,
      ordinal: passages.ordinal,
      fileId: passages.fileId,
    })
    .from(passages)
    .where(inArray(passages.id, [...new Set(ids)]))
  return new Map(rows.map((r) => [r.id, r]))
}

/** The stored Find the Evidence options, with what an option card shows. */
async function optionPassages(ids: string[]) {
  if (!ids.length) return []
  const rows = await db
    .select({
      id: passages.id,
      fileId: passages.fileId,
      page: passages.page,
      tStart: passages.tStart,
      text: passages.text,
      title: files.title,
      kind: files.kind,
      meta: files.meta,
    })
    .from(passages)
    .innerJoin(files, eq(files.id, passages.fileId))
    .where(and(inArray(passages.id, ids), isNull(files.deletedAt)))
  return rows
}

function groundOf(r: Row): RoundGround {
  return {
    fileId: r.item.fileId,
    title: r.title,
    kind: r.fileKind,
    passageId: r.item.passageId,
    page: r.item.page,
    tStart: r.item.tStart,
    quote: r.item.quote,
    byline: bylineOf(r.meta as never),
  }
}

async function toRoundItem(r: Row, asEvidence: boolean): Promise<RoundItem> {
  const now = new Date()
  const card = cardOf(r.card)
  const next = preview(card, now)
  const intervals = Object.fromEntries(
    GRADES.map((g) => [g, formatInterval(now, next[g])]),
  ) as Record<GradeValue, string>
  const data = r.item.data as StudyItemData
  const ground = groundOf(r)
  const base: RoundItem = {
    id: r.item.id,
    kind: r.item.kind,
    topic: r.item.topic,
    prompt: r.item.prompt,
    answer: r.item.answer,
    accepted: r.item.accepted,
    hints: r.item.hints,
    why: r.item.why,
    ground,
    unchecked: Boolean((r.item.check as StudyCheck).unchecked),
    intervals,
    isNew: card.state === 0,
  }
  const texts = await passageTexts([
    r.item.passageId,
    ...(data.other ? [data.other.passageId] : []),
  ])
  if (asEvidence) {
    const own = texts.get(r.item.passageId)
    const others = await optionPassages(data.distractors ?? [])
    const options: RoundOption[] = shuffle([
      { ...ground, excerpt: excerptOf(own?.text ?? r.item.quote, r.item.quote) },
      ...others.map((o) => ({
        fileId: o.fileId,
        title: o.title,
        kind: o.kind as FileKind,
        passageId: o.id,
        page: o.page,
        tStart: o.tStart,
        quote: "",
        byline: bylineOf(o.meta as never),
        excerpt: excerptOf(o.text, nearestSentence(o.text, r.item.claim)),
      })),
    ])
    return {
      ...base,
      kind: "evidence",
      prompt: r.item.claim,
      answer: r.item.passageId,
      // The evidence game's own ladder: each hint takes away one wrong option.
      hints: ["Crossed out one that doesn't say it.", "Crossed out another."],
      options,
    }
  }
  if (r.item.kind === "truefalse") return { ...base, isTrue: data.isTrue, original: data.original }
  if (r.item.kind === "order") {
    const steps = data.steps ?? []
    let shuffled = shuffle(steps)
    for (let i = 0; i < 5 && shuffled.every((s, j) => s === steps[j]); i++)
      shuffled = shuffle(steps)
    return { ...base, steps, shuffled }
  }
  if (r.item.kind === "compare" && data.other) {
    const otherFile = await db.query.files.findFirst({ where: eq(files.id, data.other.fileId) })
    const a = sidesOf(texts.get(r.item.passageId)?.text ?? r.item.quote, r.item.quote)
    const b = sidesOf(texts.get(data.other.passageId)?.text ?? data.other.quote, data.other.quote)
    return {
      ...base,
      relation: data.relation,
      sides: {
        a: { ...ground, ...a },
        b: {
          fileId: data.other.fileId,
          title: otherFile?.title ?? "Another source",
          kind: (otherFile?.kind ?? "pdf") as FileKind,
          passageId: data.other.passageId,
          page: data.other.page,
          tStart: data.other.tStart,
          quote: data.other.quote,
          byline: bylineOf((otherFile?.meta ?? null) as never),
          ...b,
        },
      },
    }
  }
  return base
}

/** Earliest due first, new ones after; one item per passage, so a round never repeats itself. */
function pickRound(rows: Row[], size: number, now: Date) {
  return onePerPassage(
    rows,
    (r) => ({ ...r.item, ...r.card, createdAt: r.item.createdAt }),
    size,
    now,
  )
}

type Queued = { passageId: string; state: number; due: Date; createdAt: Date }

/**
 * Earliest due first, new ones after (oldest first); one item per passage, so a round never
 * gives one answer away with another made from the same sentence. Today's count uses it too.
 */
function onePerPassage<T>(rows: T[], of: (row: T) => Queued, size: number, now: Date) {
  const rank = (q: Queued) =>
    q.state === 0 ? 1e15 + q.createdAt.getTime() : q.due.getTime() - now.getTime()
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of [...rows].sort((a, b) => rank(of(a)) - rank(of(b)))) {
    if (out.length >= size) break
    const { passageId } = of(r)
    if (seen.has(passageId)) continue
    seen.add(passageId)
    out.push(r)
  }
  return out
}

/** A quiz from a set: one item per passage, the kinds varied, a couple asked as evidence. */
function pickQuiz(rows: Row[], size: number) {
  const byPassage = new Map<string, Row[]>()
  for (const r of rows)
    byPassage.set(r.item.passageId, [...(byPassage.get(r.item.passageId) ?? []), r])
  const order: StudyKind[] = ["recall", "truefalse", "cloze", "order", "compare"]
  const picked: { row: Row; evidence: boolean }[] = []
  let turn = 0
  const groups = shuffle([...byPassage.values()])
  for (const group of groups) {
    if (picked.length >= size) break
    const fresh = group.filter((r) => r.card.state === 0 || r.card.due <= new Date())
    const pool = fresh.length ? fresh : group
    const want = order[turn++ % order.length]
    const row = pool.find((r) => r.item.kind === want) ?? pool[0]
    if (!row) continue
    // Every fourth one, when it can be, is asked the other way round: find its evidence.
    const evidence = picked.length % 4 === 3 && asksEvidence(row.item)
    picked.push({ row, evidence })
  }
  return picked
}

async function rowsFor(ownerId: string, where: ReturnType<typeof and>) {
  return (await db
    .select({
      item: studyItems,
      card: studyCards,
      title: files.title,
      fileKind: files.kind,
      meta: files.meta,
    })
    .from(studyItems)
    .innerJoin(studyCards, eq(studyCards.itemId, studyItems.id))
    .innerJoin(files, eq(files.id, studyItems.fileId))
    .where(and(liveItems(ownerId), where))
    .limit(2000)) as Row[]
}

export async function buildRound(
  ownerId: string,
  input: { mode: StudyMode; setId?: string; ids?: string[] },
): Promise<Round> {
  const { mode, setId, ids } = input
  const now = new Date()
  const set = setId ? await getSet(ownerId, setId) : null
  let picked: { row: Row; evidence: boolean }[]
  if (ids?.length) {
    const rows = await rowsFor(ownerId, inArray(studyItems.id, ids))
    picked = rows.map((row) => ({ row, evidence: false }))
  } else if (mode === "review") {
    const prefs = await studyPrefs(ownerId)
    const { start, end } = await dayBounds(prefs.timeZone)
    const quota = Math.max(0, prefs.dailyNew - (await newToday(ownerId, start)))
    const rows = await rowsFor(ownerId, undefined)
    const due = rows.filter((r) => r.card.state !== 0 && r.card.due < end)
    const fresh = rows
      .filter((r) => r.card.state === 0)
      .sort((a, b) => a.item.createdAt.getTime() - b.item.createdAt.getTime())
      .slice(0, quota)
    picked = pickRound([...due, ...fresh], STUDY.reviewRoundMax, now).map((row) => ({
      row,
      evidence: false,
    }))
  } else if (mode === "quiz") {
    const rows = await rowsFor(ownerId, setId ? eq(studyItems.setId, setId) : undefined)
    picked = pickQuiz(rows, STUDY.roundSize)
  } else {
    const kinds = GAME_KINDS[mode] ?? []
    let rows = await rowsFor(
      ownerId,
      and(inArray(studyItems.kind, kinds), setId ? eq(studyItems.setId, setId) : undefined),
    )
    if (mode === "evidence") rows = rows.filter((r) => asksEvidence(r.item))
    picked = pickRound(rows, STUDY.roundSize, now).map((row) => ({
      row,
      evidence: mode === "evidence",
    }))
  }
  const items = await Promise.all(picked.map((p) => toRoundItem(p.row, p.evidence)))
  return {
    roundId: crypto.randomUUID(),
    mode,
    title: set?.title ?? (mode === "review" ? "Today's review" : "Your library"),
    items: interleave(items, (i) => i.topic),
  }
}

// ------------------------------------------------------------------ answers and reviews

export async function gradeItem(
  ownerId: string,
  itemId: string,
  input: { given: string; rewrite?: boolean },
) {
  const item = await ownItem(ownerId, itemId)
  const data = item.data as StudyItemData
  const given = input.given.trim()
  if (!given) return { verdict: "wrong" as const, feedback: "Type an answer first." }
  if (input.rewrite && data.original) {
    if (quickGrade(given, [data.original]) === "right")
      return { verdict: "right" as const, feedback: "" }
  } else {
    const quick = quickGrade(given, [item.answer, ...item.accepted])
    if (quick === "right") return { verdict: "right" as const, feedback: "" }
    if (quick === "wrong") return { verdict: "wrong" as const, feedback: "Check the number." }
  }
  return gradeAnswer({
    kind: item.kind,
    prompt: item.prompt,
    answer: item.answer,
    accepted: item.accepted,
    quote: item.quote,
    given,
    original: input.rewrite ? data.original : undefined,
  })
}

/** One answer into FSRS (F29) and the review log; returns when it's due again. */
export async function recordReview(
  ownerId: string,
  itemId: string,
  input: {
    roundId: string
    outcome: Outcome
    grade: GradeValue
    hints: number
    tries: number
    answer?: string
    ms?: number
  },
) {
  const card = await db.query.studyCards.findFirst({
    where: and(eq(studyCards.itemId, itemId), eq(studyCards.ownerId, ownerId)),
  })
  if (!card) throw new LibraryError("No such item", 404)
  const next = review(cardOf(card), input.grade, new Date())
  await db.transaction(async (tx) => {
    await tx.update(studyCards).set(next).where(eq(studyCards.itemId, itemId))
    await tx.insert(studyReviews).values({
      ownerId,
      itemId,
      roundId: input.roundId,
      outcome: input.outcome,
      grade: input.grade,
      hints: input.hints,
      tries: input.tries,
      answer: input.answer?.slice(0, 2000),
      ms: input.ms,
    })
  })
  return { due: next.due.toISOString() }
}

/**
 * A finished round (F31): it counts for the day only with real recall (at least one answer got,
 * not just revealed). Two counted rounds on a repair day win back the missed days.
 */
export async function finishRound(
  ownerId: string,
  input: {
    roundId: string
    mode: StudyMode
    setId?: string
    items: number
    right: number
    helped: number
    shown: number
    timeZone?: string
  },
) {
  const prefs = await studyPrefs(ownerId)
  const zone = validZone(input.timeZone)
  if (zone && zone !== prefs.timeZone) await savePrefs(ownerId, { timeZone: zone })
  const timeZone = zone ?? prefs.timeZone
  const today = dayIn(new Date(), timeZone)
  const counted = input.right + input.helped > 0
  await db
    .insert(studyRounds)
    .values({
      id: input.roundId,
      ownerId,
      mode: input.mode,
      setId: input.setId,
      day: today,
      items: input.items,
      right: input.right,
      helped: input.helped,
      shown: input.shown,
      counted,
    })
    .onConflictDoNothing()

  let { s, freezes } = await settleStreak(ownerId, timeZone, prefs.freezes)
  let celebrate = false
  let repaired = false
  if (counted && !s.doneToday) {
    await db
      .insert(studyDays)
      .values({ ownerId, day: today, kind: "done" })
      .onConflictDoUpdate({ target: [studyDays.ownerId, studyDays.day], set: { kind: "done" } })
    ;({ s, freezes } = await settleStreak(ownerId, timeZone, freezes))
    celebrate = isMilestone(s.current)
    const earned = freezesAfter(freezes, s.current)
    if (earned !== freezes) {
      freezes = earned
      await savePrefs(ownerId, { streakFreezes: freezes })
    }
  }
  if (counted && s.repair && (await roundsToday(ownerId, today)) >= REPAIR_ROUNDS) {
    await db
      .insert(studyDays)
      .values(s.repair.days.map((day) => ({ ownerId, day, kind: "repair" as const })))
      .onConflictDoNothing()
    repaired = true
    ;({ s, freezes } = await settleStreak(ownerId, timeZone, freezes))
  }
  return { counted, celebrate, repaired, streak: await streakView(ownerId, s, freezes, today) }
}

// ------------------------------------------------------------------ Edit / Remove / This is wrong

async function ownItem(ownerId: string, itemId: string) {
  const item = await db.query.studyItems.findFirst({
    where: and(eq(studyItems.id, itemId), eq(studyItems.ownerId, ownerId)),
  })
  if (!item) throw new LibraryError("No such item", 404)
  return item
}

async function forCheck(item: typeof studyItems.$inferSelect): Promise<ItemForCheck> {
  const data = item.data as StudyItemData
  const texts = await passageTexts([item.passageId, ...(data.other ? [data.other.passageId] : [])])
  return {
    kind: item.kind,
    prompt: item.prompt,
    answer: item.answer,
    accepted: item.accepted,
    data,
    passage: texts.get(item.passageId)?.text ?? item.quote,
    otherPassage: data.other
      ? (texts.get(data.other.passageId)?.text ?? data.other.quote)
      : undefined,
  }
}

export type ItemEdit = {
  prompt: string
  answer: string
  accepted?: string[]
  hints?: string[]
  steps?: string[]
  /** Save even though the source doesn't support it (marked "not checked"). */
  keepUnchecked?: boolean
}

/** Edit (F27): the change is checked against the passage before it's saved. */
export async function editItem(ownerId: string, itemId: string, edit: ItemEdit) {
  const item = await ownItem(ownerId, itemId)
  const data = item.data as StudyItemData
  const next = {
    prompt: edit.prompt.trim(),
    answer:
      item.kind === "order" ? (edit.steps ?? data.steps ?? []).join(" → ") : edit.answer.trim(),
    accepted: (edit.accepted ?? item.accepted).map((a) => a.trim()).filter(Boolean),
    hints: (edit.hints ?? item.hints)
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 2),
    data: item.kind === "order" ? { ...data, steps: edit.steps ?? data.steps } : data,
  }
  if (!next.prompt || !next.answer)
    throw new LibraryError("A question and an answer are needed", 400)
  const check = item.check as StudyCheck
  if (!edit.keepUnchecked) {
    const verdict = await checkEdit(await forCheck({ ...item, ...next }))
    if (!verdict.ok) return { saved: false as const, problem: verdict.problem }
    await db
      .update(studyItems)
      .set({ ...next, check: { ...check, edited: true, unchecked: false, model: verdict.model } })
      .where(eq(studyItems.id, itemId))
    return { saved: true as const, checked: true }
  }
  await db
    .update(studyItems)
    .set({ ...next, check: { ...check, edited: true, unchecked: true } })
    .where(eq(studyItems.id, itemId))
  return { saved: true as const, checked: false }
}

export async function setItemStatus(ownerId: string, itemId: string, status: "active" | "removed") {
  await ownItem(ownerId, itemId)
  await db.update(studyItems).set({ status }).where(eq(studyItems.id, itemId))
}

/**
 * This is wrong (F27): the Verifier checks again with the person's reason. Wrong → the item goes
 * and the correction is remembered for the Tutor (F33). Not wrong → the source's own words.
 */
export async function reportWrong(ownerId: string, itemId: string, reason?: string) {
  const item = await ownItem(ownerId, itemId)
  const tracer = new Tracer(`study-wrong-${itemId}`)
  const verdict = await recheckItem(await forCheck(item), reason, tracer)
  await tracer.flush()
  if (verdict.wrong) {
    const file = await db.query.files.findFirst({ where: eq(files.id, item.fileId) })
    await db.update(studyItems).set({ status: "wrong" }).where(eq(studyItems.id, itemId))
    recordWrongItem(ownerId, {
      title: file?.title ?? "a file",
      question: item.prompt,
      answer: item.answer,
      reason,
      itemId,
    })
    return { removed: true, why: verdict.why }
  }
  return { removed: false, why: verdict.why, quote: item.quote }
}

// ------------------------------------------------------------------ lecture → notes (F32)

type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string }

export async function notesFromFile(ownerId: string, fileId: string) {
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.ownerId, ownerId), isNull(files.deletedAt)),
  })
  if (!file) throw new LibraryError("No such file", 404)
  if (file.kind === "note") throw new LibraryError("That's already a note", 400)
  if (file.status !== "ready") throw new LibraryError("That file is still being read", 409)
  const rows = await db
    .select()
    .from(passages)
    .where(and(eq(passages.fileId, fileId), inArray(passages.kind, ["text", "transcript"])))
    .orderBy(passages.ordinal)
  if (!rows.length) throw new LibraryError("There's no text in that file to make notes from", 400)
  const tracer = new Tracer(`notes-${fileId}-${Date.now()}`)
  const source: StudyPassage[] = rows.map((p) => ({
    id: p.id,
    fileId: p.fileId,
    title: file.title,
    ordinal: p.ordinal,
    page: p.page,
    tStart: p.tStart,
    text: p.text,
  }))
  const result = await makeNotes(source, file.title, tracer)
  await tracer.flush()
  if (!result.sections.length)
    throw new LibraryError("No point could be cited from the source. Try again.", 422)
  const byline = bylineOf(file.meta as never) ?? null
  const nodes: PMNode[] = []
  const lines: string[] = []
  for (const section of result.sections) {
    nodes.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: section.heading }],
    })
    lines.push(section.heading)
    nodes.push({
      type: "bulletList",
      content: section.points.map((pt) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: `${pt.text} ` },
              {
                type: "citation",
                attrs: {
                  fileId: file.id,
                  passageId: pt.passage.id,
                  title: file.title,
                  kind: file.kind,
                  page: pt.passage.page,
                  tStart: pt.passage.tStart,
                  byline,
                  quote: pt.quote,
                },
              },
            ],
          },
        ],
      })),
    })
    for (const pt of section.points) lines.push(`- ${pt.text}`)
  }
  const [folder] = await db
    .select({ id: fileFolders.folderId })
    .from(fileFolders)
    .where(eq(fileFolders.fileId, fileId))
    .limit(1)
  const note = await createNote(ownerId, {
    title: `Notes: ${file.title}`.slice(0, 300),
    folderId: folder?.id,
    content: { type: "doc", content: nodes },
    text: lines.join("\n"),
  })
  return {
    id: note.id,
    points: result.sections.reduce((n, s) => n + s.points.length, 0),
    dropped: result.dropped,
  }
}

// ------------------------------------------------------------------ Make flashcard (F08)

/** The set flashcards made from a selection go into (one per person). */
async function flashcardSet(ownerId: string) {
  const existing = await db.query.studySets.findFirst({
    where: and(eq(studySets.ownerId, ownerId), eq(studySets.title, "Flashcards")),
  })
  if (existing) return existing.id
  const id = crypto.randomUUID()
  await db.insert(studySets).values({
    id,
    ownerId,
    title: "Flashcards",
    scope: { fileIds: [], folderIds: [] },
    status: "ready",
    runId: `study-${id}`,
  })
  return id
}

/** The passage on a page that holds a selection: the one containing its words, or sharing most. */
async function passageForSelection(ownerId: string, fileId: string, page: number, text: string) {
  const rows = await db
    .select({ id: passages.id, text: passages.text })
    .from(passages)
    .where(
      and(
        eq(passages.fileId, fileId),
        eq(passages.ownerId, ownerId),
        inArray(passages.kind, ["text", "transcript"]),
        sql`${passages.page} between ${page - 1} and ${page}`,
      ),
    )
  const key = quoteKey(text)
  const contained = rows.find((r) => quoteKey(r.text).includes(key.slice(0, 60)))
  if (contained) return contained.id
  const words = new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? [])
  const shared = (t: string) =>
    (t.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => words.has(w)).length
  return rows.sort((a, b) => shared(b.text) - shared(a.text))[0]?.id
}

export async function makeFlashcard(
  ownerId: string,
  input: { passageId?: string; fileId?: string; page?: number; text: string },
) {
  const passageId =
    input.passageId ??
    (input.fileId && input.page != null
      ? await passageForSelection(ownerId, input.fileId, input.page, input.text)
      : undefined)
  if (!passageId) throw new LibraryError("Couldn't find that text in the source", 404)
  const [row] = await db
    .select({ passage: passages, title: files.title, kind: files.kind })
    .from(passages)
    .innerJoin(files, eq(files.id, passages.fileId))
    .where(and(eq(passages.id, passageId), eq(passages.ownerId, ownerId), isNull(files.deletedAt)))
  if (!row) throw new LibraryError("No such passage", 404)
  if (row.kind === "note") throw new LibraryError("Flashcards are made from sources", 400)
  const tracer = new Tracer(`flashcard-${Date.now()}`)
  const result = await makeItems(
    {
      fileId: row.passage.fileId,
      title: row.title,
      passages: [
        {
          id: row.passage.id,
          fileId: row.passage.fileId,
          title: row.title,
          ordinal: row.passage.ordinal,
          page: row.passage.page,
          tStart: row.passage.tStart,
          text: row.passage.text,
        },
      ],
      centrality: 0,
    },
    { tracer, key: "card", focus: input.text },
  )
  await tracer.flush()
  const cards = result.items.filter((i) => i.kind === "recall" || i.kind === "cloze").slice(0, 2)
  if (!cards.length)
    throw new LibraryError("No flashcard from that passed the checks. Try a longer selection.", 422)
  const setId = await flashcardSet(ownerId)
  const now = new Date()
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(studyItems)
      .values(
        cards.map((i) => ({
          ownerId,
          setId,
          fileId: i.ground.fileId,
          passageId: i.ground.passageId,
          page: i.ground.page,
          tStart: i.ground.tStart,
          kind: i.kind,
          topic: i.topic,
          prompt: i.prompt,
          answer: i.answer,
          accepted: i.accepted,
          hints: i.hints,
          quote: i.ground.quote,
          why: i.why,
          claim: i.claim,
          data: i.data,
          check: i.check,
        })),
      )
      .returning({ id: studyItems.id })
    await tx
      .insert(studyCards)
      .values(inserted.map((r) => ({ itemId: r.id, ownerId, ...newCard(now) })))
    await tx
      .update(studySets)
      .set({ made: sql`${studySets.made} + ${cards.length}` })
      .where(eq(studySets.id, setId))
  })
  return { setId, made: cards.length, prompt: cards[0]?.prompt ?? "" }
}
