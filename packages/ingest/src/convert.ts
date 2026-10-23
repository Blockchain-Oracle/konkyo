import { INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"

async function gotenberg(route: string, form: FormData): Promise<Uint8Array> {
  const res = await fetch(new URL(route, env.GOTENBERG_URL), {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(INGEST.convertTimeoutMs),
  })
  if (!res.ok)
    throw new Error(
      `Gotenberg ${route} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
    )
  return new Uint8Array(await res.arrayBuffer())
}

const blob = (data: Uint8Array | string, type: string) =>
  new Blob([typeof data === "string" ? data : Buffer.from(data)], { type })

/** DOCX / PPTX → PDF with LibreOffice. Slides keep their speaker notes (S00: exportNotesPages). */
export function officeToPdf(bytes: Uint8Array, filename: string): Promise<Uint8Array> {
  const form = new FormData()
  form.append("files", blob(bytes, "application/octet-stream"), filename)
  if (/\.pptx?$/i.test(filename)) form.append("exportNotesPages", "true")
  return gotenberg("/forms/libreoffice/convert", form)
}

/** A self-contained HTML page → PDF with Chromium (web articles, Markdown, plain text). */
export function htmlToPdf(html: string): Promise<Uint8Array> {
  const form = new FormData()
  form.append("files", blob(html, "text/html"), "index.html")
  form.append("printBackground", "true")
  form.append("preferCssPageSize", "false")
  return gotenberg("/forms/chromium/convert/html", form)
}

/** Markdown → PDF through Gotenberg's own Markdown route. */
export function markdownToPdf(markdown: string, title: string): Promise<Uint8Array> {
  const form = new FormData()
  form.append(
    "files",
    blob(documentHtml(title, '{{ toHTML "doc.md" }}'), "text/html"),
    "index.html",
  )
  form.append("files", blob(markdown, "text/markdown"), "doc.md")
  return gotenberg("/forms/chromium/convert/markdown", form)
}

const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

/** The page every converted document is printed on: plain, readable, A4. */
export function documentHtml(
  title: string,
  bodyHtml: string,
  source?: { url: string; site?: string },
) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4; margin: 22mm 20mm; }
body { font: 11pt/1.55 Georgia, "Times New Roman", serif; color: #111; }
h1 { font: 600 20pt/1.25 -apple-system, "Helvetica Neue", Arial, sans-serif; margin: 0 0 6pt; }
h2, h3 { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; line-height: 1.3; }
.source { font: 9pt/1.4 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #555; margin-bottom: 16pt; }
img, figure { max-width: 100%; } pre { white-space: pre-wrap; font: 9.5pt/1.5 Menlo, monospace; }
table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 3pt 5pt; }
</style></head><body>
${source ? `<div class="source">${escapeHtml(source.site ?? new URL(source.url).hostname)} · ${escapeHtml(source.url)}</div>` : ""}
${bodyHtml}
</body></html>`
}

export const textToHtml = (text: string) => `<pre>${escapeHtml(text)}</pre>`
export { escapeHtml }
