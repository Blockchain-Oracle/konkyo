import {
  type AnswerEvent,
  answer,
  answerParts,
  type DeepCandidate,
  type DeepEvent,
  type FoundSource,
  findSources,
  type KonkyoMessage,
  planSearch,
  screenSources,
  Tracer,
} from "@konkyo/agents"
import { DEEP } from "@konkyo/config"
import { db, pg, schema } from "@konkyo/db"
import { enqueue } from "@konkyo/jobs"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"

const { runs, runEvents, messages, files, folders, fileFolders, userSettings } = schema

/** What a deep run keeps between its two phases (runs.state). */
type DeepRunState = {
  topic?: string
  candidates?: (DeepCandidate & { source: FoundSource })[]
  approved?: { keys: string[]; folderName: string }
  folderId?: string
  /** "Find sources on this topic": import into this folder instead of a new one. */
  intoFolderId?: string
  /** Import what's found without asking, for this run only (the Research starter, F39). */
  autoImport?: boolean
  steer?: string[]
}

class Stopped extends Error {}

const chains = new Map<string, Promise<unknown>>()

/**
 * Writes one event and wakes the run view's stream (pg_notify on "run_events"). Writes for a run
 * go one after another, so events fired without waiting (sources as they're found) keep order.
 */
function emit(runId: string, event: DeepEvent): Promise<unknown> {
  const next = (chains.get(runId) ?? Promise.resolve()).then(async () => {
    await db.insert(runEvents).values({ runId, type: event.type, data: event })
    await pg.notify("run_events", runId)
  })
  chains.set(
    runId,
    next.catch((error: Error) => console.warn(`[deep] ${runId} event: ${error.message}`)),
  )
  return next
}

/** The answer's draft arrives as many small deltas: they're sent a few times a second, joined. */
function answerEmitter(runId: string) {
  let pending = ""
  let timer: ReturnType<typeof setTimeout> | null = null
  let last: Promise<unknown> = Promise.resolve()
  const send = (event: AnswerEvent) => {
    last = emit(runId, { type: "answer", event })
  }
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending) send({ type: "text", delta: pending })
    pending = ""
  }
  return {
    event(event: AnswerEvent) {
      if (event.type === "text") {
        pending += event.delta
        timer ??= setTimeout(flush, 300)
        return
      }
      flush()
      send(event)
    },
    async done() {
      flush()
      await last
    },
  }
}

async function loadRun(runId: string) {
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) })
  if (!run || run.kind !== "deep") throw new Error(`No deep run ${runId}`)
  return run
}

async function setRun(runId: string, set: Partial<typeof runs.$inferInsert>) {
  await db.update(runs).set(set).where(eq(runs.id, runId))
}

/** Stop is pressed in the web app (status "stopped"); the run checks between steps. */
async function checkStopped(runId: string) {
  const row = await db.query.runs.findFirst({
    columns: { status: true },
    where: eq(runs.id, runId),
  })
  if (row?.status === "stopped") throw new Stopped()
}

/** The question with any direction the person added mid-run (Steer). */
const steered = (question: string, state: DeepRunState) =>
  state.steer?.length ? `${question}\n\n(The person added: ${state.steer.join("; ")})` : question

const summary = (s: FoundSource): DeepCandidate => ({
  key: s.key,
  kind: s.kind,
  title: s.title,
  detail:
    s.kind === "paper"
      ? [s.authors.length > 1 ? `${s.authors[0]} et al.` : s.authors[0], s.year, s.venue]
          .filter(Boolean)
          .join(" · ")
      : s.site,
  why: "",
  score: 0,
  url: s.kind === "web" ? s.url : s.doi ? `https://doi.org/${s.doi}` : undefined,
})

export async function finish(
  runId: string,
  status: Extract<DeepEvent, { type: "end" }>["status"],
  message?: string,
) {
  const stored = status === "nothing-found" ? "not-found" : status
  await setRun(runId, { status: stored, finishedAt: new Date() })
  await emit(runId, { type: "end", status, message })
}

// ------------------------------------------------------------------ phase 1: search

async function search(runId: string) {
  const run = await loadRun(runId)
  const tracer = new Tracer(runId)
  const state = (run.state ?? {}) as DeepRunState
  await setRun(runId, { status: "searching" })

  await emit(runId, { type: "stage", id: "plan", label: "Planning the search", state: "running" })
  const plan = await planSearch(steered(run.question, state), tracer)
  await emit(runId, {
    type: "stage",
    id: "plan",
    label: "Planning the search",
    state: "done",
    detail: plan.paperQueries.join(" · "),
  })
  await checkStopped(runId)

  await emit(runId, {
    type: "stage",
    id: "search",
    label: "Searching OpenAlex and the web",
    state: "running",
  })
  // Papers already in the library aren't found again.
  const knownRows = await db.execute<{ doi: string }>(sql`
    select lower(meta->'csl'->>'DOI') as doi from ${files}
    where owner_id = ${run.ownerId} and deleted_at is null and meta->'csl'->>'DOI' is not null`)
  const found = await findSources(plan, {
    tracer,
    known: new Set(knownRows.map((r) => r.doi)),
    onFound: (source) => void emit(runId, { type: "found", source: summary(source) }),
  })
  const papers = found.filter((f) => f.kind === "paper").length
  await emit(runId, {
    type: "stage",
    id: "search",
    label: "Searching OpenAlex and the web",
    state: found.length ? "done" : "failed",
    detail: `${papers} paper${papers === 1 ? "" : "s"} with a free PDF · ${found.length - papers} web page${found.length - papers === 1 ? "" : "s"}`,
  })
  if (!found.length) {
    await finish(
      runId,
      "nothing-found",
      "Nothing open to read matched. Try other words, or upload the papers you have.",
    )
    return
  }
  await checkStopped(runId)

  await emit(runId, {
    type: "stage",
    id: "screen",
    label: `Screening ${found.length} sources`,
    state: "running",
  })
  const { shortlist, report } = await screenSources(steered(run.question, state), found, {
    tracer,
    onStep: (step) => void emit(runId, { type: "screened", ...step }),
  })
  await emit(runId, {
    type: "stage",
    id: "screen",
    label: `Screening ${found.length} sources`,
    state: shortlist.length ? "done" : "failed",
    detail: `${shortlist.length} worth reading · ${report.steps} Markovian step${report.steps === 1 ? "" : "s"}`,
  })
  if (!shortlist.length) {
    await finish(
      runId,
      "nothing-found",
      "What came back didn't answer the question. Try other words.",
    )
    return
  }

  const candidates = shortlist.map((s) => ({
    ...summary(s),
    why: s.why,
    score: s.score,
    source: s as FoundSource,
  }))
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, run.ownerId),
  })
  const auto = state.autoImport || (settings?.autoImportSources ?? false)
  const next: DeepRunState = {
    ...state,
    topic: plan.topic,
    candidates,
    ...(auto ? { approved: { keys: candidates.map((c) => c.key), folderName: plan.topic } } : {}),
  }
  await setRun(runId, { state: next, status: auto ? "importing" : "awaiting" })
  const into = state.intoFolderId
    ? await db.query.folders.findFirst({ where: eq(folders.id, state.intoFolderId) })
    : undefined
  await emit(runId, {
    type: "shortlist",
    candidates: candidates.map(({ source: _source, ...c }) => c),
    folderName: into?.name ?? plan.topic,
    report,
    auto,
    intoFolder: Boolean(into),
  })
  await tracer.flush()
  if (auto) return importAndAnswer(runId)
  await emit(runId, {
    type: "stage",
    id: "approve",
    label: "Waiting for you to choose",
    state: "running",
  })
}

// ------------------------------------------------------------------ phase 2: import + answer

/** A folder named for the topic; a second search on it gets "Topic (2)". */
async function newFolder(ownerId: string, name: string) {
  const taken = new Set(
    (
      await db
        .select({ name: folders.name })
        .from(folders)
        .where(
          and(eq(folders.ownerId, ownerId), isNull(folders.parentId), isNull(folders.deletedAt)),
        )
    ).map((f) => f.name),
  )
  let unique = name.trim().slice(0, 80) || "Deep search"
  for (let i = 2; taken.has(unique); i++) unique = `${name.trim().slice(0, 74)} (${i})`
  const [folder] = await db.insert(folders).values({ ownerId, name: unique }).returning()
  if (!folder) throw new Error("Couldn't create the folder")
  return folder
}

async function importAndAnswer(runId: string) {
  const run = await loadRun(runId)
  const tracer = new Tracer(runId)
  const state = (run.state ?? {}) as DeepRunState
  const chosen = (state.candidates ?? []).filter((c) => state.approved?.keys.includes(c.key))
  if (!chosen.length) return finish(runId, "stopped", "Nothing was chosen to import.")
  await setRun(runId, { status: "importing" })
  await emit(runId, { type: "stage", id: "approve", label: "Sources chosen", state: "done" })

  const existing = state.intoFolderId
    ? await db.query.folders.findFirst({
        where: and(
          eq(folders.id, state.intoFolderId),
          eq(folders.ownerId, run.ownerId),
          isNull(folders.deletedAt),
        ),
      })
    : undefined
  const folder =
    existing ?? (await newFolder(run.ownerId, state.approved?.folderName ?? state.topic ?? ""))
  await setRun(runId, { state: { ...state, folderId: folder.id } })
  await emit(runId, {
    type: "approved",
    keys: chosen.map((c) => c.key),
    folderName: folder.name,
    folderId: folder.id,
  })
  await emit(runId, {
    type: "stage",
    id: "import",
    label: `Reading ${chosen.length} source${chosen.length === 1 ? "" : "s"}`,
    state: "running",
    detail: folder.name,
  })

  // Papers download from OpenAlex's own PDF copy (the ingest "web" path knows openalex.org/W…);
  // pages are saved as PDFs like any imported link. Both are read by the usual pipeline.
  const created = await db
    .insert(files)
    .values(
      chosen.map(({ source }) =>
        source.kind === "paper"
          ? {
              ownerId: run.ownerId,
              title: source.title,
              kind: "web" as const,
              sourceUrl: `https://openalex.org/${source.workId}`,
              status: "queued" as const,
              stage: "Waiting to be read",
              meta: { csl: source.csl, foundBy: "doi" as const },
            }
          : {
              ownerId: run.ownerId,
              // The site until the page is read; the article's own title replaces it then.
              title: source.site,
              kind: "web" as const,
              sourceUrl: source.url,
              status: "queued" as const,
              stage: "Waiting to be read",
            },
      ),
    )
    .returning({ id: files.id, title: files.title })
  await db.insert(fileFolders).values(created.map((f) => ({ fileId: f.id, folderId: folder.id })))
  const keyOf = new Map(created.map((f, i) => [f.id, chosen[i]?.key as string]))
  for (const f of created) {
    await enqueue("ingest", { fileId: f.id }, f.id)
    await emit(runId, {
      type: "file",
      key: keyOf.get(f.id) as string,
      fileId: f.id,
      title: f.title,
      status: "queued",
      stage: "Waiting to be read",
    })
  }

  // Wait until every file is read (or needs the person), reporting each change.
  const ids = created.map((f) => f.id)
  const seen = new Map<string, string>()
  const deadline = Date.now() + DEEP.importWaitMs
  let rows: {
    id: string
    title: string
    status: string
    stage: string | null
    progress: number | null
    problemDetail: string | null
  }[] = []
  for (;;) {
    await checkStopped(runId)
    rows = await db
      .select({
        id: files.id,
        title: files.title,
        status: files.status,
        stage: files.stage,
        progress: files.progress,
        problemDetail: files.problemDetail,
      })
      .from(files)
      .where(inArray(files.id, ids))
    for (const f of rows) {
      const sig = `${f.status}|${f.stage}|${Math.round((f.progress ?? 0) * 10)}|${f.title}`
      if (seen.get(f.id) === sig) continue
      seen.set(f.id, sig)
      await emit(runId, {
        type: "file",
        key: keyOf.get(f.id) as string,
        fileId: f.id,
        title: f.title,
        status: f.status,
        stage: f.stage ?? undefined,
        progress: f.progress ?? undefined,
        problem: f.problemDetail ?? undefined,
      })
    }
    const settled = rows.every((f) => f.status === "ready" || f.status === "needs_you")
    if (settled || Date.now() > deadline) break
    await new Promise((resolve) => setTimeout(resolve, DEEP.pollMs))
  }
  const ready = rows.filter((f) => f.status === "ready").length
  await emit(runId, {
    type: "stage",
    id: "import",
    label: `Reading ${chosen.length} source${chosen.length === 1 ? "" : "s"}`,
    state: ready ? "done" : "failed",
    detail: `${ready} of ${chosen.length} ready · in “${folder.name}”`,
  })
  if (!ready)
    return finish(runId, "failed", "None of the sources could be read. Try another search.")

  // The answer comes from the new folder only, through the same agents and checks as any chat.
  await setRun(runId, { status: "answering" })
  await emit(runId, {
    type: "stage",
    id: "answer",
    label: `Answering from ${ready} new source${ready === 1 ? "" : "s"}`,
    state: "running",
  })
  const events: AnswerEvent[] = []
  const out = answerEmitter(runId)
  const result = await answer({
    ownerId: run.ownerId,
    question: steered(run.question, state),
    history: [],
    scope: { folderIds: [folder.id] },
    // Several new sources on one question: show where they agree and where they don't.
    compare: true,
    tracer,
    emit: (event) => {
      events.push(event)
      out.event(event)
    },
  })
  await out.done()
  await emit(runId, {
    type: "stage",
    id: "answer",
    label: `Answering from ${ready} new source${ready === 1 ? "" : "s"}`,
    state: "done",
  })

  // The answer is saved into the run's message, so history, export and 👍/👎 treat it like
  // any other answer.
  if (run.messageId) {
    const deepPart: KonkyoMessage["parts"][number] = {
      type: "data-deep",
      id: "deep",
      data: { runId, question: run.question },
    }
    await db
      .update(messages)
      .set({ parts: [deepPart, ...answerParts(events)] })
      .where(eq(messages.id, run.messageId))
  }
  const receipt = events.find((e) => e.type === "receipt")
  await setRun(runId, {
    receipt: receipt?.type === "receipt" ? receipt.receipt : null,
    events: tracer.events,
  })
  await tracer.flush()
  await finish(runId, result.status === "answered" ? "answered" : "not-found")
}

/** One deep-search job; a failure ends the run with a plain message instead of hanging it. */
export async function deepJob(runId: string, phase: "search" | "import") {
  try {
    if (phase === "search") await search(runId)
    else await importAndAnswer(runId)
  } catch (error) {
    if (error instanceof Stopped) return
    console.error(`[deep] ${runId}`, error)
    await finish(runId, "failed", "The search stopped on an error. Try again.").catch(
      () => undefined,
    )
  }
}
