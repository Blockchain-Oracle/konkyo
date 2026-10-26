import { pickWindows, Tracer, writeBrief } from "@konkyo/agents"
import { BRIEF } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { speakDialogue, timeLines, transcribe } from "@konkyo/ingest"
import { notify } from "@konkyo/notify"
import { objectKey, putBytes } from "@konkyo/storage"
import { eq } from "drizzle-orm"

const { briefs } = schema

/**
 * An audio brief: the script is written and checked from the folder's most central
 * passages, spoken by two voices in one request, then timed by a Scribe pass over the real audio
 * so each line's citation lands on the moment it's said.
 */
export async function makeBrief(briefId: string) {
  const brief = await db.query.briefs.findFirst({ where: eq(briefs.id, briefId) })
  if (brief?.status !== "making") return
  const tracer = new Tracer(brief.runId ?? `brief-${briefId}`)
  const started = performance.now()
  const fail = async (problem: string) => {
    await db.update(briefs).set({ status: "failed", problem }).where(eq(briefs.id, briefId))
    tracer.log({ agent: "system", step: "brief", action: "brief_failed", detail: { problem } })
    await tracer.flush()
  }
  try {
    const { windows } = await pickWindows(brief.ownerId, brief.scope, BRIEF.windows)
    tracer.log({
      agent: "writer",
      step: "pick",
      action: "picked_windows",
      rowsReturned: windows.length,
      detail: { files: new Set(windows.map((w) => w.fileId)).size },
    })
    if (!windows.length) return fail("These files have no text to talk about yet.")

    const script = await writeBrief(windows, brief.title, tracer)
    if (script.lines.length < 4)
      return fail("Too little in these files passed the checks to make a brief. Add more sources.")

    const voice = (s: "A" | "B") => BRIEF.voices[s].id
    let t = performance.now()
    const spoken = await speakDialogue(
      script.lines.map((l) => ({ voiceId: voice(l.speaker), text: l.text })),
    )
    tracer.log({
      agent: "system",
      step: "speak",
      action: "spoke_dialogue",
      model: BRIEF.model,
      latencyMs: Math.round(performance.now() - t),
      detail: {
        lines: script.lines.length,
        chars: script.lines.reduce((n, l) => n + l.text.length, 0),
        bytes: spoken.audio.length,
      },
    })

    // The dialogue API's own clock drifts; Scribe on the real audio gives each line its time.
    t = performance.now()
    const heard = await transcribe(spoken.audio, "brief.mp3").catch(() => null)
    const times = timeLines(
      script.lines.map((l) => l.text),
      heard?.words ?? [],
      spoken.approximate,
    )
    tracer.log({
      agent: "system",
      step: "time",
      action: heard ? "timed_lines" : "kept_dialogue_times",
      latencyMs: Math.round(performance.now() - t),
      detail: { words: heard?.words.length ?? 0, duration: heard?.duration ?? null },
    })

    const key = objectKey("briefs", brief.ownerId, `${briefId}.mp3`)
    await putBytes(key, spoken.audio, "audio/mpeg")
    const duration = heard?.duration ?? times.at(-1)?.end ?? null
    await db
      .update(briefs)
      .set({
        status: "ready",
        title: script.title,
        lines: script.lines.map((l, i) => ({
          ...l,
          start: times[i]?.start ?? 0,
          end: times[i]?.end ?? 0,
        })),
        audioKey: key,
        durationSeconds: duration,
      })
      .where(eq(briefs.id, briefId))
    tracer.log({
      agent: "system",
      step: "brief",
      action: "brief_ready",
      latencyMs: Math.round(performance.now() - started),
      rowsReturned: script.lines.length,
      detail: { dropped: script.dropped, seconds: duration },
    })
    await tracer.flush()
    await notify(brief.ownerId, {
      kind: "brief",
      title: `Your audio brief “${script.title}” is ready`,
      body: `${script.lines.length} lines, every fact cited${duration ? `, ${Math.round(duration / 60) || 1} min` : ""}.`,
      href: `/briefs/${briefId}`,
      tag: `brief-${briefId}`,
    })
  } catch (error) {
    console.error(`[brief] ${briefId}`, error)
    await fail(
      (error as Error).name === "OutOfCreditError"
        ? (error as Error).message
        : "Making the brief stopped on an error. Try again.",
    )
  }
}
