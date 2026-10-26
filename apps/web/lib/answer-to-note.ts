import type { Citation } from "@konkyo/agents"

type PMNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: { type: string }[]
}

/**
 * A verified answer as note content: its question as a heading, its
 * paragraphs with each [n] marker turned into a citation (the same passage and quote), and its
 * caveat in italics. Plain text comes with it, for chat.
 */
export function answerToNote(
  question: string,
  body: string,
  caveat: string | undefined,
  citations: Citation[],
) {
  const byN = new Map(citations.map((c) => [c.n, c]))
  const nodes: PMNode[] = []
  if (question.trim())
    nodes.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: question.trim() }],
    })
  for (const paragraph of body.split(/\n{2,}/)) {
    const content: PMNode[] = []
    let last = 0
    for (const m of paragraph.matchAll(/\s*\[(\d+)\]/g)) {
      const c = byN.get(Number(m[1]))
      if (m.index > last) content.push({ type: "text", text: paragraph.slice(last, m.index) })
      if (c)
        content.push({
          type: "citation",
          attrs: {
            fileId: c.fileId,
            passageId: c.passageId,
            title: c.title,
            kind: c.kind,
            page: c.page,
            tStart: c.tStart,
            byline: c.byline ?? null,
            quote: c.quote,
          },
        })
      last = m.index + m[0].length
    }
    if (last < paragraph.length) content.push({ type: "text", text: paragraph.slice(last) })
    if (content.length) nodes.push({ type: "paragraph", content })
  }
  if (caveat)
    nodes.push({
      type: "paragraph",
      content: [{ type: "text", text: caveat, marks: [{ type: "italic" }] }],
    })
  const text = [question.trim(), body.replace(/\s*\[\d+\]/g, ""), caveat]
    .filter(Boolean)
    .join("\n\n")
  return { nodes, text }
}
