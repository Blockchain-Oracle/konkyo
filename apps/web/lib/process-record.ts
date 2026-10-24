import "server-only"
import { APP } from "@konkyo/config"
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { getNote, listNoteEvents, listVersions } from "./notes"

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

type Line = { at: string; what: string; details: string[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The process record (plan F25): what the writer did with Konkyo's help, in order, and the
 * version history. Written to be handed in as an appendix (IB IA / EE style): it shows which
 * claims were checked, which sources were suggested and cited, and how the draft grew.
 */
export async function processRecord(ownerId: string, noteId: string) {
  const [note, events, versions] = await Promise.all([
    getNote(ownerId, noteId),
    listNoteEvents(ownerId, noteId),
    listVersions(ownerId, noteId),
  ])
  const lines: Line[] = events.map((e) => {
    const d = e.data
    switch (e.type) {
      case "checked": {
        const c = d.counts as Record<string, number> | undefined
        const claims =
          (d.claims as {
            claim: string
            verdict: string
            source: string | null
            quote: string | null
          }[]) ?? []
        return {
          at: e.createdAt,
          what: `Checked the draft: ${[
            `${c?.supported ?? 0} supported`,
            `${c?.partly ?? 0} partly supported`,
            c?.contradicted ? `${c.contradicted} contradicted` : null,
            `${c?.["not-found"] ?? 0} not found`,
          ]
            .filter(Boolean)
            .join(", ")}`,
          details: claims.map(
            (k) =>
              `${k.verdict === "supported" ? "Supported" : k.verdict === "partly" ? "Partly supported" : k.verdict === "contradicted" ? "Contradicted" : "Not found"}: ${k.claim}${k.source ? ` (${k.source}${k.quote ? `: “${k.quote}”` : ""})` : ""}`,
          ),
        }
      }
      case "searched-citation":
        return {
          at: e.createdAt,
          what: `Searched the library for a source: “${String(d.text ?? "")}”`,
          details: [`${d.found ?? 0} passages offered`],
        }
      case "cited":
        return {
          at: e.createdAt,
          what: `Cited ${String(d.title ?? "a source")}${d.page ? `, p. ${String(d.page)}` : ""}`,
          details: d.quote ? [`Quote: “${String(d.quote)}”`] : [],
        }
      case "published":
        return {
          at: e.createdAt,
          what: `${Number(d.version) > 1 ? "Republished" : "Published"} as “${String(d.title ?? "")}”`,
          details: [`${APP.url}/a/${String(d.slug ?? "")}`],
        }
      case "restored":
        return {
          at: e.createdAt,
          what: `Restored ${d.name ? `the version “${String(d.name)}”` : "an earlier version"}`,
          details: [],
        }
      default:
        return { at: e.createdAt, what: e.type, details: [] }
    }
  })
  const oldestFirst = [...versions].reverse()
  const counts = {
    checks: events.filter((e) => e.type === "checked").length,
    citations: events.filter((e) => e.type === "cited").length,
    searches: events.filter((e) => e.type === "searched-citation").length,
  }
  return { note, lines, versions: oldestFirst, counts }
}

export function recordMarkdown(r: Awaited<ReturnType<typeof processRecord>>) {
  const out = [
    `# Process record: ${r.note.title}`,
    "",
    `_Exported from Konkyo on ${stamp(new Date().toISOString())}. Konkyo answers only from the writer's own library, and every quote it offered was checked against its source._`,
    "",
    "## Summary",
    "",
    `- ${plural(r.versions.length, "saved version")}, ${plural(r.note.words, "word")} now`,
    `- ${plural(r.counts.checks, "draft check")}, ${plural(r.counts.searches, "source search", "source searches")}, ${plural(r.counts.citations, "citation")} inserted`,
    "",
    "## What was done with Konkyo",
    "",
    ...(r.lines.length
      ? r.lines.flatMap((l) => [
          `**${stamp(l.at)}** · ${l.what}`,
          ...l.details.map((d) => `  - ${d}`),
          "",
        ])
      : ["Nothing yet.", ""]),
    "## Versions",
    "",
    "| Saved | Version | Words |",
    "|---|---|---|",
    ...r.versions.map((v) => `| ${stamp(v.createdAt)} | ${v.name ?? "Autosave"} | ${v.words} |`),
    "",
  ]
  return out.join("\n")
}

export async function recordDocx(r: Awaited<ReturnType<typeof processRecord>>) {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun(`Process record: ${r.note.title}`)],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported from Konkyo on ${stamp(new Date().toISOString())}. Konkyo answers only from the writer's own library, and every quote it offered was checked against its source.`,
          italics: true,
        }),
      ],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Summary")] }),
    new Paragraph({
      bullet: { level: 0 },
      children: [
        new TextRun(
          `${plural(r.versions.length, "saved version")}, ${plural(r.note.words, "word")} now`,
        ),
      ],
    }),
    new Paragraph({
      bullet: { level: 0 },
      children: [
        new TextRun(
          `${plural(r.counts.checks, "draft check")}, ${plural(r.counts.searches, "source search", "source searches")}, ${plural(r.counts.citations, "citation")} inserted`,
        ),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun("What was done with Konkyo")],
    }),
  ]
  for (const l of r.lines) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${stamp(l.at)} · `, bold: true }), new TextRun(l.what)],
      }),
    )
    for (const d of l.details)
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(d)] }))
  }
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Versions")] }),
  )
  for (const v of r.versions)
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun(`${stamp(v.createdAt)} · ${v.name ?? "Autosave"} · ${v.words} words`),
        ],
      }),
    )
  const doc = new Document({
    creator: "Konkyo",
    title: `Process record: ${r.note.title}`,
    styles: { default: { document: { run: { font: "Times New Roman", size: 22 } } } },
    sections: [{ children }],
  })
  return Packer.toBuffer(doc)
}
