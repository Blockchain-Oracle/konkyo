import {
  type MadeItem,
  makeComparisons,
  makeItems,
  pickWindows,
  type StudyWindow,
  scopeFileIds,
  Tracer,
  tutorCorrections,
} from "@konkyo/agents"
import { STUDY } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { newCard } from "@konkyo/study"
import { eq, sql } from "drizzle-orm"

const { studySets, studyItems, studyCards } = schema

/** Items into the set, each with a new FSRS card (due now: it can be practised straight away). */
async function save(setId: string, ownerId: string, items: MadeItem[], dropped: number) {
  if (!items.length && !dropped) return
  await db.transaction(async (tx) => {
    if (items.length) {
      const rows = await tx
        .insert(studyItems)
        .values(
          items.map((i) => ({
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
      const now = new Date()
      await tx
        .insert(studyCards)
        .values(rows.map((r) => ({ itemId: r.id, ownerId, ...newCard(now) })))
    }
    await tx
      .update(studySets)
      .set({
        made: sql`${studySets.made} + ${items.length}`,
        dropped: sql`${studySets.dropped} + ${dropped}`,
      })
      .where(eq(studySets.id, setId))
  })
}

/**
 * A practice set: pick passage windows, then for each one the Tutor drafts items, code
 * checks their quotes, the Verifier checks every answer key and Zetaris confirms every quote.
 * Items are saved as they pass, so the first round can start before the set is finished.
 */
export async function makeSet(setId: string) {
  const set = await db.query.studySets.findFirst({ where: eq(studySets.id, setId) })
  if (set?.status !== "generating") return
  const tracer = new Tracer(set.runId ?? `study-${setId}`)
  const started = performance.now()
  try {
    // The whole library (null) reads the most windows; a folder by the files really in it.
    const inScope = await scopeFileIds(set.ownerId, set.scope)
    const files = inScope?.length ?? Number.POSITIVE_INFINITY
    const want = Math.min(
      STUDY.windowsMax,
      STUDY.windowsForOneFile + Math.max(0, files - 1) * STUDY.windowsPerExtraFile,
    )
    const { windows, fileIds } = await pickWindows(set.ownerId, set.scope, want)
    tracer.log({
      agent: "tutor",
      step: "pick",
      action: "picked_windows",
      rowsReturned: windows.length,
      detail: { files: new Set(windows.map((w) => w.fileId)).size, want },
    })
    await db.update(studySets).set({ passages: windows.length }).where(eq(studySets.id, setId))
    if (!windows.length) {
      await db
        .update(studySets)
        .set({ status: "failed", problem: "These files have no text to practise from yet." })
        .where(eq(studySets.id, setId))
      return
    }
    const corrections = await tutorCorrections(set.ownerId, set.title)

    const queue: { w: StudyWindow; i: number }[] = windows.map((w, i) => ({ w, i }))
    let made = 0
    let failure: Error | undefined
    const work = async () => {
      for (;;) {
        const next = queue.shift()
        if (!next) return
        try {
          const result = await makeItems(next.w, {
            corrections,
            tracer,
            key: `w${next.i}`,
            ownerId: set.ownerId,
          })
          made += result.items.length
          await save(setId, set.ownerId, result.items, result.dropped)
        } catch (error) {
          // One window failing (a timeout, a malformed reply) doesn't sink the set; out of
          // credit, every window would fail the same way, so the rest are skipped.
          failure = error as Error
          if (failure.name === "OutOfCreditError") queue.length = 0
          tracer.log({
            agent: "tutor",
            step: "make-items",
            action: "window_failed",
            detail: { window: next.i, reason: (error as Error).message.slice(0, 300) },
          })
        }
      }
    }
    await Promise.all(Array.from({ length: STUDY.concurrency }, work))

    if (new Set(fileIds).size > 1 && failure?.name !== "OutOfCreditError") {
      const compared = await makeComparisons(set.ownerId, windows, fileIds, {
        tracer,
        want: STUDY.comparisons,
      }).catch((error: Error) => {
        tracer.log({
          agent: "analyst",
          step: "compare",
          action: "failed",
          detail: { reason: error.message },
        })
        return []
      })
      made += compared.length
      await save(setId, set.ownerId, compared, 0)
    }

    await db
      .update(studySets)
      .set(
        made
          ? { status: "ready" }
          : {
              status: "failed",
              problem:
                failure?.name === "OutOfCreditError"
                  ? failure.message
                  : failure
                    ? "Making practice failed. Try again."
                    : "No item passed every check. Try other files.",
            },
      )
      .where(eq(studySets.id, setId))
    tracer.log({
      agent: "system",
      step: "study",
      action: "set_ready",
      latencyMs: Math.round(performance.now() - started),
      rowsReturned: made,
    })
  } catch (error) {
    await db
      .update(studySets)
      .set({ status: "failed", problem: "Making practice failed. Try again." })
      .where(eq(studySets.id, setId))
    tracer.log({
      agent: "system",
      step: "study",
      action: "failed",
      detail: { reason: (error as Error).message.slice(0, 500) },
    })
    console.error(`[study] ${setId}`, error)
  } finally {
    await tracer.flush()
  }
}
