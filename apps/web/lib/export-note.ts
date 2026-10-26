import "server-only"
import { Cite } from "@citation-js/core"
import type { CslItem, FileMeta } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { readableFileSql } from "@konkyo/db/access"
import {
  AlignmentType,
  Document,
  FootnoteReferenceRun,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  type ParagraphChild,
  TextRun,
} from "docx"
import { and, inArray } from "drizzle-orm"
import { loadStyle, type StyleInfo } from "./csl"
import { getNote, type NoteDoc } from "./notes"

const { files } = schema

export type PMNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string }[]
  content?: PMNode[]
}

/**
 * A note's words as plain text, a blank line between blocks, derived on the server from the saved
 * document: what moderation reads, what read-aloud says, and what a check for publishing checks.
 */
export function docText(content: unknown, options: { citations?: boolean } = {}): string {
  const blocks: string[] = []
  const inline = (n: PMNode): string =>
    n.type === "text"
      ? (n.text ?? "")
      : n.type === "citation" && options.citations
        ? // a version's diff shows a citation put in or taken out
          ` [${String(n.attrs?.title ?? "source")}${n.attrs?.page ? `, p. ${n.attrs.page}` : ""}]`
        : (n.content ?? []).map(inline).join("")
  const walk = (n: PMNode) => {
    if (["paragraph", "heading", "blockquote", "listItem", "codeBlock"].includes(n.type)) {
      const line = inline(n).trim()
      if (line) blocks.push(line)
      return
    }
    for (const c of n.content ?? []) walk(c)
  }
  walk(content as PMNode)
  return blocks.join("\n\n")
}

/** Every citation in the note, in the order they appear. */
export function citationsIn(doc: PMNode): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (n: PMNode) => {
    if (n.type === "citation" && n.attrs) out.push(n.attrs)
    for (const c of n.content ?? []) walk(c)
  }
  walk(doc)
  return out
}

/** A cited file as CSL-JSON: its stored record (OpenAlex/arXiv/you), else what's known of it. */
type CslEntry = Record<string, unknown> & { id: string }

export async function cslItems(ownerId: string, fileIds: string[]): Promise<Map<string, CslEntry>> {
  if (!fileIds.length) return new Map()
  const rows = await db
    .select({
      id: files.id,
      title: files.title,
      kind: files.kind,
      sourceUrl: files.sourceUrl,
      meta: files.meta,
      createdAt: files.createdAt,
    })
    .from(files)
    // a citation names only a source this person can read (theirs, or in a space they're in)
    .where(and(inArray(files.id, fileIds), readableFileSql(ownerId, "files")))
  return new Map(
    rows.map((r) => {
      const csl = (r.meta as FileMeta | null)?.csl
      const fallback: Record<string, unknown> = {
        type:
          r.kind === "web"
            ? "webpage"
            : r.kind === "audio" || r.kind === "video"
              ? "speech"
              : "manuscript",
        title: r.title,
        ...(r.sourceUrl ? { URL: r.sourceUrl } : {}),
        accessed: {
          "date-parts": [
            [r.createdAt.getFullYear(), r.createdAt.getMonth() + 1, r.createdAt.getDate()],
          ],
        },
      }
      const entry: CslEntry = {
        ...((csl as CslItem | undefined) ?? fallback),
        title: csl?.title ?? r.title,
        id: r.id,
      }
      return [r.id, entry]
    }),
  )
}

/** CSL HTML (an entry with <i>/<b>) as Word runs. */
function htmlRuns(html: string): TextRun[] {
  const decode = (s: string) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#38;/g, "&")
      .replace(/&#39;|&#x27;/g, "'")
  const runs: TextRun[] = []
  const re = /<(i|b)>([\s\S]*?)<\/\1>|([^<]+)|<[^>]+>/g
  for (const m of html.matchAll(re)) {
    if (m[3]) runs.push(new TextRun(decode(m[3])))
    else if (m[1] === "i" && m[2])
      runs.push(new TextRun({ text: decode(m[2].replace(/<[^>]+>/g, "")), italics: true }))
    else if (m[1] === "b" && m[2])
      runs.push(new TextRun({ text: decode(m[2].replace(/<[^>]+>/g, "")), bold: true }))
  }
  return runs
}

const bibliographyHeading = (style: StyleInfo) =>
  style.id === "modern-language-association"
    ? "Works Cited"
    : style.kind === "note"
      ? "Bibliography"
      : "References"

/**
 * A note as Word, its citations in the chosen CSL style: in-text styles cite in the
 * sentence, numeric styles number sources by first appearance, note styles become footnotes;
 * the reference list follows. Each citation's page or timestamp goes in as its locator.
 */
export async function noteDocx(ownerId: string, noteId: string, styleId: string) {
  const note = await getNote(ownerId, noteId)
  const doc = note.content as PMNode
  const style = await loadStyle(styleId)
  const cited = citationsIn(doc)
  const order = [...new Set(cited.map((c) => String(c.fileId)))]
  const items = await cslItems(ownerId, order)
  const cite = new Cite(order.map((id) => items.get(id)).filter(Boolean))
  const number = new Map(order.map((id, i) => [id, i + 1]))

  const footnotes: Record<number, { children: Paragraph[] }> = {}
  let nextFootnote = 1
  const citationText = (attrs: Record<string, unknown>) => {
    const id = String(attrs.fileId)
    if (!items.has(id)) return ""
    const page = attrs.page != null ? String(attrs.page) : undefined
    // citation-js accepts citation items with locators here; its types only know plain ids.
    const out = cite.format("citation", {
      template: style.id,
      format: "text",
      lang: "en-US",
      entry: [{ id, ...(page ? { locator: page, label: "page" } : {}) }],
    } as never) as string
    // citeproc numbers each lone citation 1: numeric styles take their number from the order.
    return style.kind === "numeric" ? out.replace(/\d+/, String(number.get(id))) : out
  }

  const runsOf = (
    nodes: PMNode[] | undefined,
    inherited: { italics?: boolean } = {},
  ): ParagraphChild[] => {
    const out: ParagraphChild[] = []
    let last = ""
    for (const n of nodes ?? []) {
      if (n.type === "text" && n.text) {
        const marks = new Set((n.marks ?? []).map((m) => m.type))
        out.push(
          new TextRun({
            text: n.text,
            bold: marks.has("bold"),
            italics: marks.has("italic") || inherited.italics,
            strike: marks.has("strike"),
          }),
        )
        last = n.text
      } else if (n.type === "hardBreak") {
        out.push(new TextRun({ text: "", break: 1 }))
      } else if (n.type === "citation" && n.attrs) {
        const text = citationText(n.attrs)
        if (!text) continue
        if (style.kind === "note") {
          footnotes[nextFootnote] = { children: [new Paragraph({ children: [new TextRun(text)] })] }
          out.push(new FootnoteReferenceRun(nextFootnote++))
        } else {
          out.push(new TextRun(`${/\s$/.test(last) || !last ? "" : " "}${text}`))
        }
      }
    }
    return out
  }

  const body: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(note.title)] }),
  ]
  let listInstance = 0
  const block = (
    n: PMNode,
    ctx: { list?: "bullets" | "numbers"; instance?: number; quote?: boolean } = {},
  ) => {
    switch (n.type) {
      case "heading": {
        const level = Number(n.attrs?.level ?? 2)
        body.push(
          new Paragraph({
            heading:
              level <= 1
                ? HeadingLevel.HEADING_1
                : level === 2
                  ? HeadingLevel.HEADING_2
                  : HeadingLevel.HEADING_3,
            children: runsOf(n.content),
          }),
        )
        break
      }
      case "paragraph":
        body.push(
          new Paragraph({
            children: runsOf(n.content, { italics: ctx.quote }),
            ...(ctx.list
              ? { numbering: { reference: ctx.list, level: 0, instance: ctx.instance } }
              : {}),
            ...(ctx.quote ? { indent: { left: 720 } } : {}),
          }),
        )
        break
      case "bulletList":
      case "orderedList": {
        const list = n.type === "bulletList" ? "bullets" : "numbers"
        const instance = ++listInstance
        for (const item of n.content ?? [])
          for (const c of item.content ?? []) block(c, { ...ctx, list, instance })
        break
      }
      case "blockquote":
        for (const c of n.content ?? []) block(c, { ...ctx, quote: true })
        break
      case "codeBlock":
        body.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (n.content ?? []).map((c) => c.text ?? "").join(""),
                font: "Courier New",
              }),
            ],
          }),
        )
        break
      case "horizontalRule":
        body.push(
          new Paragraph({ children: [new TextRun("* * *")], alignment: AlignmentType.CENTER }),
        )
        break
      default:
        for (const c of n.content ?? []) block(c, ctx)
    }
  }
  for (const n of doc.content ?? []) block(n)

  const html = order.length
    ? (cite.format("bibliography", {
        template: style.id,
        format: "html",
        lang: "en-US",
      } as never) as string)
    : ""
  // One entry per data-csl-entry-id (numeric styles nest a margin and a body inside each).
  const entries = html.split(/(?=<div[^>]*data-csl-entry-id=)/).slice(1)
  // A style can leave every cited item out of its list: then there's no empty heading either.
  if (entries.length) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun(bibliographyHeading(style))],
        pageBreakBefore: true,
      }),
    )
    for (const entry of entries)
      body.push(
        new Paragraph({
          children: htmlRuns(
            entry
              .replace(/<\/?div[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          ),
          indent: style.kind === "numeric" ? undefined : { left: 720, hanging: 720 },
          spacing: { after: 120 },
        }),
      )
  }

  const document = new Document({
    creator: "Konkyo",
    title: note.title,
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24 },
          paragraph: { spacing: { line: 360, after: 120 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    footnotes,
    sections: [{ children: body }],
  })
  return { title: note.title, bytes: await Packer.toBuffer(document), cited: order.length }
}

export type { NoteDoc }

/**
 * One passage, cited in the person's style (the source pane's Cite): the in-text citation with its
 * page, and the source's reference-list entry, as plain text for the clipboard.
 */
export async function citePassage(ownerId: string, fileId: string, styleId: string, page?: number) {
  const items = await cslItems(ownerId, [fileId])
  const item = items.get(fileId)
  if (!item) return null
  const style = await loadStyle(styleId)
  const cite = new Cite([item])
  const options = { template: style.id, format: "text", lang: "en-US" }
  const inline = (
    cite.format("citation", {
      ...options,
      entry: [{ id: fileId, ...(page ? { locator: String(page), label: "page" } : {}) }],
    } as never) as string
  ).trim()
  const reference = (cite.format("bibliography", options as never) as string).trim()
  return {
    inline: style.kind === "numeric" ? inline.replace(/\d+/, "1") : inline,
    reference,
    style: style.id,
  }
}
