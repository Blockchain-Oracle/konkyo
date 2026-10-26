import "server-only"
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"

/** **bold** and _italic_ spans as Word runs (the export's own Markdown uses nothing else inline). */
function runs(text: string, base: { italics?: boolean } = {}) {
  return text
    .split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**")
        ? new TextRun({ text: part.slice(2, -2), bold: true, ...base })
        : part.startsWith("_") && part.endsWith("_") && part.length > 2
          ? new TextRun({ text: part.slice(1, -1), italics: true })
          : new TextRun({ text: part, ...base }),
    )
}

const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim())

const thin = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" }

function table(rows: string[]) {
  const [head, , ...body] = rows
  const line = (row: string, bold: boolean) =>
    new TableRow({
      children: cellsOf(row).map(
        (c) =>
          new TableCell({
            borders: { top: thin, bottom: thin, left: thin, right: thin },
            children: [
              new Paragraph({ children: bold ? [new TextRun({ text: c, bold })] : runs(c) }),
            ],
          }),
      ),
    })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [line(head ?? "", true), ...body.map((r) => line(r, false))],
  })
}

/**
 * A chat's export Markdown (chat-export.ts) as a Word document: the same headings,
 * quotes, numbered sources and agree/disagree table, so every format says the same thing.
 */
export async function chatDocx(markdown: string, title: string) {
  const children: (Paragraph | Table)[] = []
  const blocks = markdown.split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split("\n")
    const first = lines[0] ?? ""
    if (first.startsWith("|")) children.push(table(lines.filter((l) => l.startsWith("|"))))
    else if (first.startsWith("# "))
      children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: runs(first.slice(2)) }))
    else if (first.startsWith("## "))
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(first.slice(3)) }),
      )
    else if (first.startsWith("> "))
      for (const l of lines)
        children.push(
          new Paragraph({
            indent: { left: 480 },
            children: runs(l.replace(/^>\s?/, ""), { italics: true }),
          }),
        )
    else if (/^\d+\.\s/.test(first))
      for (const l of lines) children.push(new Paragraph({ children: runs(l) }))
    else children.push(new Paragraph({ children: runs(lines.join(" ")) }))
    children.push(new Paragraph({ children: [] }))
  }
  const doc = new Document({ title, creator: "Konkyo", sections: [{ children }] })
  return Packer.toBuffer(doc)
}
