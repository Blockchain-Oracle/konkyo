import "server-only"
import type { Citation, KonkyoMessage, Matrix } from "@konkyo/agents"
import { getChat } from "./chats"
import { LibraryError } from "./library"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
const where = (c: { page: number | null; tStart: number | null }) =>
  c.page != null ? `p. ${c.page}` : c.tStart != null ? clock(c.tStart) : ""
/** Table cells can't hold pipes or line breaks. */
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ")

function sourcesBlock(citations: Citation[]) {
  const seen = new Map<number, Citation>()
  for (const c of citations) if (!seen.has(c.n)) seen.set(c.n, c)
  return [...seen.values()]
    .sort((a, b) => a.n - b.n)
    .map((c) => {
      const at = [c.byline, where(c)].filter(Boolean).join(", ")
      return `${c.n}. **${c.title}**${at ? ` (${at})` : ""}: “${c.quote}”`
    })
    .join("\n")
}

// Glyphs every PDF font has: ◐ falls back to a broken shape in Chromium's print fonts.
const STANCE = { agrees: "✓ Agrees", disagrees: "✕ Disagrees", partly: "≈ Partly" } as const

function matrixBlock(matrix: Matrix) {
  if (!matrix.claims.length) return ""
  const head = `| Claim | ${matrix.sources.map((s) => cell(s.byline ?? s.title)).join(" | ")} |`
  const rule = `|---|${matrix.sources.map(() => "---").join("|")}|`
  const rows = matrix.claims.map((c) => {
    const cells = matrix.sources.map((s) => {
      const x = c.cells.find((k) => k.fileId === s.fileId)
      return x ? cell(`${STANCE[x.stance]}: “${x.quote}”`) : "—"
    })
    return `| ${cell(c.text)} | ${cells.join(" | ")} |`
  })
  return `**Where the sources agree and disagree**\n\n${[head, rule, ...rows].join("\n")}`
}

function answerBlock(message: KonkyoMessage) {
  const final = message.parts.find((p) => p.type === "data-final")
  const matrix = message.parts.find((p) => p.type === "data-matrix")
  const receipt = message.parts.find((p) => p.type === "data-receipt")
  if (message.parts.some((p) => p.type === "data-notFound"))
    return "_Not in the library: Konkyo found nothing that answers this, so it didn't guess._"
  if (final?.type !== "data-final")
    return "_This answer didn't finish, so nothing in it was verified._"
  const checked =
    receipt?.type === "data-receipt"
      ? `_Checked ${receipt.data.quotes + (receipt.data.analyst?.relations ?? 0)} quotes against ${receipt.data.sources} sources in Zetaris._`
      : ""
  return [
    final.data.body,
    // Caveats are never cited (older answers may still carry a stray marker).
    final.data.caveat ? `> ${final.data.caveat.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "")}` : "",
    matrix?.type === "data-matrix" ? matrixBlock(matrix.data) : "",
    final.data.citations.length ? `**Sources**\n\n${sourcesBlock(final.data.citations)}` : "",
    checked,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/**
 * A chat as Markdown (plan F17 export): each question, its verified answer with the [n] markers
 * kept, the exact quote behind every number, and the agree/disagree table where there was one.
 */
export async function chatMarkdown(ownerId: string, chatId: string) {
  const found = await getChat(ownerId, chatId)
  if (!found) throw new LibraryError("No such chat", 404)
  const turns = found.messages.map((m) => {
    if (m.role === "user") {
      const quote = m.parts.find((p) => p.type === "data-quote")
      const text = m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n")
      const about =
        quote?.type === "data-quote"
          ? `> “${quote.data.text}” (${quote.data.title}${quote.data.page ? `, p. ${quote.data.page}` : ""})\n\n`
          : ""
      return `## ${text.replace(/\n+/g, " ")}\n\n${about}`.trimEnd()
    }
    return answerBlock(m)
  })
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  // A title cut from the first question ("…") reads better whole.
  const first = found.messages.find((m) => m.role === "user")
  const firstText = first?.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")
  const title =
    found.chat.title.endsWith("…") && firstText?.startsWith(found.chat.title.slice(0, -1))
      ? firstText
      : found.chat.title
  return {
    title,
    markdown: `# ${title}\n\n_Exported from Konkyo on ${date}. Every quote below was checked against its source._\n\n${turns.join("\n\n")}\n`,
  }
}
