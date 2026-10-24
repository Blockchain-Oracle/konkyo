import { createHash } from "node:crypto"
import { INGEST } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { fileSpaceEvents } from "@konkyo/db/live"
import {
  articleToPdf,
  documentHtml,
  doiFromUrl,
  embeddingHash,
  embedTexts,
  extractPassages,
  type FileMeta,
  fetchSource,
  fetchYouTube,
  findMetadata,
  htmlToPdf,
  isYouTube,
  LockedPdfError,
  looksLikeFileName,
  markdownToPdf,
  ocrPdf,
  officeToPdf,
  openAccessPdfs,
  openAlexIdWithPdf,
  openAlexPdf,
  openPdf,
  renderRGBA,
  summarize,
  textToHtml,
  transcribe,
  UnreachableError,
  type Word,
  wordsToPassages,
} from "@konkyo/ingest"
import { enqueue } from "@konkyo/jobs"
import { getBytes, objectKey, putBytes } from "@konkyo/storage"
import {
  confirmPublished,
  type EvidenceDoc,
  ensureEvidenceTables,
  publishPassages,
  publishPdfText,
} from "@konkyo/zetaris"
import { and, eq, inArray, isNull, ne } from "drizzle-orm"
import { materialize } from "./connectors"
import { indexNote } from "./notes"
import { ProblemError } from "./problem"

const { files, passages, embeddingCache } = schema

type FileRow = typeof files.$inferSelect
type NewPassage = typeof passages.$inferInsert

/**
 * A PDF's own title field, when it is a title: publishers often leave a file id there
 * ("pone.0108100 1..5"), and word processors their own name.
 */
function usableMetaTitle(title: string | undefined) {
  const t = title?.trim()
  if (!t || t.length <= 3 || !/\s/.test(t)) return undefined
  if (/^untitled|microsoft word|^document\d*$/i.test(t)) return undefined
  if (/\d+\.\.\d+|^[a-z]+\.\d{4,}/i.test(t) || looksLikeFileName(t)) return undefined
  return t
}

/**
 * A title the file was only given to have one (its file name, or an imported link's address):
 * what the file itself says replaces it. A real title (yours, or a paper's from OpenAlex) stays.
 */
function placeholderTitle(file: FileRow) {
  if (looksLikeFileName(file.title)) return true
  if (!file.sourceUrl) return false
  try {
    const url = new URL(file.sourceUrl)
    return (
      file.title === url.hostname + url.pathname ||
      file.title === url.hostname.replace(/^www\./, "")
    )
  } catch {
    return false
  }
}

/** Problems the person has to act on: no point retrying them. */

type DocResult = {
  passages: NewPassage[]
  /** A link that turned out to be a PDF is a PDF in the library, not a "web page". */
  kind?: FileRow["kind"]
  rendition?: Uint8Array
  pages?: FileRow["pages"]
  fromScan?: boolean
  title?: string
  duration?: number
  /** The source's own picture: a web page's og:image (its polaroid on the wall). */
  image?: string
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

async function update(fileId: string, values: Partial<typeof files.$inferInsert>) {
  await db.update(files).set(values).where(eq(files.id, fileId))
}

/** Time spent in each stage of the current job, logged when the job ends. */
const clocks = new Map<string, { label: string; at: number; spans: string[] }>()

function lap(fileId: string, next: string) {
  const clock = clocks.get(fileId)
  const now = performance.now()
  if (clock) {
    clock.spans.push(`${clock.label} ${Math.round(now - clock.at)}ms`)
    clock.label = next
    clock.at = now
  } else clocks.set(fileId, { label: next, at: now, spans: [] })
}

const stage = (fileId: string, label: string, progress: number) => {
  lap(fileId, label)
  return update(fileId, { status: "processing", stage: label, progress })
}

// ------------------------------------------------------------------ documents

const PDF_HYPHENS = { pdf: "auto", converted: "keep" } as const

/** "Reading page n of N" on the row, written at most once a second. */
function pageProgress(fileId: string, from: number, to: number) {
  let last = 0
  return (page: number, total: number) => {
    const now = Date.now()
    if (now - last < 1000 && page < total) return
    last = now
    return update(fileId, {
      status: "processing",
      stage: `Reading page ${page} of ${total}`,
      progress: from + ((to - from) * page) / total,
    })
  }
}

/** PDF → passages with page boxes; scanned pages get OCR first (and the file is "Text from scan"). */
async function fromPdf(
  file: FileRow,
  pdfBytes: Uint8Array,
  hyphens: "auto" | "keep",
): Promise<DocResult> {
  let bytes = pdfBytes
  let pdf = await openPdf(bytes)
  const info = await pdf.getMetadata().catch(() => null)
  const metaTitle = (info?.info as { Title?: string } | undefined)?.Title?.trim()
  lap(file.id, "Reading pages")
  let extracted = await extractPassages(pdf, file.id, {
    hyphens,
    inkCheck: (page) => renderRGBA(page),
    onPage: pageProgress(file.id, 0.25, 0.55),
  })
  const charsOnPage = (page: number) =>
    extracted.passages.filter((p) => p.page === page).reduce((n, p) => n + p.text.length, 0)
  const scanned = extracted.pages.filter((p) => charsOnPage(p.page) < INGEST.scanCharsPerPage)
  let fromScan = false
  if (scanned.length > 0) {
    await stage(
      file.id,
      `Reading ${scanned.length} scanned page${scanned.length > 1 ? "s" : ""}`,
      0.35,
    )
    const before = extracted.text.length
    await pdf.loadingTask.destroy()
    bytes = await ocrPdf(bytes)
    pdf = await openPdf(bytes)
    lap(file.id, "Reading OCR text")
    extracted = await extractPassages(pdf, file.id, {
      hyphens,
      inkCheck: (page) => renderRGBA(page),
      onPage: pageProgress(file.id, 0.45, 0.55),
    })
    fromScan = extracted.text.length > before
  }
  await pdf.loadingTask.destroy()
  return {
    rendition: bytes,
    fromScan,
    title: usableMetaTitle(metaTitle),
    pages: extracted.pages.map((p) => ({
      page: p.page,
      width: p.width,
      height: p.height,
      rotate: p.rotate,
    })),
    passages: extracted.passages.map((p, ordinal) => ({
      id: p.pid,
      fileId: file.id,
      ownerId: file.ownerId,
      ordinal,
      page: p.page,
      kind: p.kind,
      text: p.text,
      charStart: p.charStart,
      charEnd: p.charEnd,
      bboxes: p.bboxes,
      lineStarts: p.lineStarts,
    })),
  }
}

function fromWords(file: FileRow, words: Word[]): NewPassage[] {
  return wordsToPassages(words).map((p, ordinal) => ({
    id: `${file.id}:t${ordinal}`,
    fileId: file.id,
    ownerId: file.ownerId,
    ordinal,
    kind: "transcript",
    text: p.text,
    tStart: p.tStart,
    tEnd: p.tEnd,
    speaker: p.speaker,
  }))
}

async function readSource(file: FileRow): Promise<DocResult> {
  switch (file.kind) {
    case "note":
      throw new Error("Notes are read by indexNote")
    case "pdf": {
      if (!file.originalKey) throw new Error("PDF has no stored original")
      return fromPdf(file, await getBytes(file.originalKey), PDF_HYPHENS.pdf)
    }
    case "docx":
    case "pptx": {
      if (!file.originalKey) throw new Error("Document has no stored original")
      await stage(file.id, "Converting to PDF", 0.15)
      const pdf = await officeToPdf(await getBytes(file.originalKey), file.title)
      return fromPdf(file, pdf, PDF_HYPHENS.converted)
    }
    case "markdown":
    case "text": {
      if (!file.originalKey) throw new Error("Text file has no stored original")
      await stage(file.id, "Converting to PDF", 0.15)
      const text = new TextDecoder().decode(await getBytes(file.originalKey))
      const pdf =
        file.kind === "markdown"
          ? await markdownToPdf(text, file.title)
          : await htmlToPdf(documentHtml(file.title, textToHtml(text)))
      return fromPdf(file, pdf, PDF_HYPHENS.converted)
    }
    case "email": {
      if (!file.originalKey) throw new Error("Email has no stored copy")
      await stage(file.id, "Converting to PDF", 0.15)
      const html = new TextDecoder().decode(await getBytes(file.originalKey))
      return fromPdf(file, await htmlToPdf(html), PDF_HYPHENS.converted)
    }
    case "web": {
      if (!file.sourceUrl) throw new Error("Web import has no URL")
      // A paper from deep search (an OpenAlex work) or a pasted DOI: read the open-access PDF,
      // never the publisher's abstract page. OpenAlex's own copy first (10/10 in S00), then
      // every open location it knows.
      const workId = file.sourceUrl.match(/^https:\/\/openalex\.org\/(W\d+)$/)?.[1]
      // A web page whose details later found a DOI stays a web page: only the URL decides.
      const doi =
        doiFromUrl(file.sourceUrl) ??
        (workId ? ((file.meta as FileMeta | null)?.csl?.DOI ?? null) : null)
      if (workId || doi) {
        await stage(file.id, "Finding an open copy", 0.1)
        const id = workId ?? (doi ? await openAlexIdWithPdf(doi) : null)
        const own = id ? await openAlexPdf(id) : null
        if (own) return { ...(await fromPdf(file, own, PDF_HYPHENS.pdf)), kind: "pdf" }
        for (const url of doi ? await openAccessPdfs(doi) : []) {
          const copy = await fetchSource(url).catch(() => null)
          if (copy?.contentType.includes("pdf"))
            return { ...(await fromPdf(file, copy.bytes, PDF_HYPHENS.pdf)), kind: "pdf" }
        }
        throw new ProblemError(
          "unreachable",
          "This paper has no free copy online. Upload its PDF to read it here.",
        )
      }
      await stage(file.id, "Fetching the page", 0.15)
      const source = await fetchSource(file.sourceUrl)
      if (source.contentType.includes("pdf"))
        return { ...(await fromPdf(file, source.bytes, PDF_HYPHENS.pdf)), kind: "pdf" }
      if (!source.contentType.includes("html")) {
        throw new ProblemError(
          "unsupported",
          `This link serves ${source.contentType || "an unknown type"}`,
        )
      }
      await stage(file.id, "Saving the article as a PDF", 0.2)
      // Licensed starter material carries its attribution on every page of the copy (F39).
      const licence = (file.meta as FileMeta | null)?.licence
      const article = await articleToPdf(new TextDecoder().decode(source.bytes), source.finalUrl, {
        footer: licence ? `${licence.attribution} · ${licence.name}` : undefined,
      })
      const result = await fromPdf(file, article.pdf, PDF_HYPHENS.converted)
      return { ...result, title: article.title, image: article.ogImage }
    }
    case "youtube": {
      if (!file.sourceUrl || !isYouTube(file.sourceUrl)) throw new Error("Not a YouTube link")
      await stage(file.id, "Fetching captions", 0.1)
      const video = await fetchYouTube(file.sourceUrl)
      if (video.words)
        return {
          title: video.title,
          duration: video.duration,
          passages: fromWords(file, video.words),
        }
      if (!video.audio) throw new UnreachableError("YouTube returned no captions or audio")
      await stage(file.id, "Transcribing", 0.3)
      const { words } = await transcribe(video.audio.bytes, video.audio.name)
      return { title: video.title, duration: video.duration, passages: fromWords(file, words) }
    }
    case "audio":
    case "video": {
      if (!file.originalKey) throw new Error("Recording has no stored original")
      await stage(file.id, "Transcribing", 0.2)
      const { words, duration } = await transcribe(await getBytes(file.originalKey), file.title)
      return { duration, passages: fromWords(file, words) }
    }
  }
}

// ------------------------------------------------------------------ embeddings

/** Embeds passages, reusing cached vectors for text already embedded anywhere. */
export async function embed(rows: NewPassage[]): Promise<number> {
  const hashes = rows.map((r) => embeddingHash(r.text))
  const cached = new Map<string, number[]>()
  for (let i = 0; i < hashes.length; i += 500) {
    const slice = hashes.slice(i, i + 500)
    const hits = await db
      .select({ hash: embeddingCache.hash, embedding: embeddingCache.embedding })
      .from(embeddingCache)
      .where(inArray(embeddingCache.hash, slice))
    for (const hit of hits) cached.set(hit.hash, hit.embedding)
  }
  const missing = [...new Set(hashes.filter((h) => !cached.has(h)))]
  let tokens = 0
  if (missing.length) {
    const textFor = new Map(rows.map((r, i) => [hashes[i] as string, r.text]))
    const { vectors, tokens: used } = await embedTexts(missing.map((h) => textFor.get(h) as string))
    tokens = used
    const fresh = missing.map((hash, i) => ({ hash, embedding: vectors[i] as number[] }))
    for (let i = 0; i < fresh.length; i += 200) {
      await db
        .insert(embeddingCache)
        .values(fresh.slice(i, i + 200))
        .onConflictDoNothing()
    }
    for (const f of fresh) cached.set(f.hash, f.embedding)
  }
  rows.forEach((row, i) => {
    row.embedding = cached.get(hashes[i] as string)
  })
  return tokens
}

// ------------------------------------------------------------------ details (F06)

/** The opening line or two of page 1, where a paper prints its title. */
function openingLines(rows: NewPassage[]): string | undefined {
  const first = rows.find((r) => (r.page ?? 1) === 1 && r.kind === "text")
  if (!first) return undefined
  const starts = first.lineStarts ?? [0]
  const lines = [0, 1].map((i) =>
    first.text.slice(starts[i] ?? first.text.length, starts[i + 1] ?? first.text.length).trim(),
  )
  const joined = lines.filter(Boolean).join(" ")
  return joined && joined.length < 200 ? joined : lines[0] || undefined
}

/**
 * The published record (OpenAlex) and a short summary, both best-effort: a file is never held
 * back or failed because a lookup was slow or found nothing. Details the person edited stay.
 */
async function describe(
  file: FileRow,
  result: DocResult,
): Promise<{ meta: FileMeta; title?: string }> {
  const previous = (file.meta ?? {}) as FileMeta
  const text = result.passages.map((p) => p.text).join("\n")
  const isDocument = file.kind !== "audio" && file.kind !== "video" && file.kind !== "youtube"
  const titleHint =
    result.title ?? (looksLikeFileName(file.title) ? openingLines(result.passages) : file.title)
  const [found, summary] = await Promise.all([
    isDocument && previous.foundBy !== "you"
      ? findMetadata({
          fileName: file.title,
          title: titleHint,
          text,
          sourceUrl: file.sourceUrl,
        }).catch((error: Error) => {
          console.warn(`[details] ${file.id} OpenAlex: ${error.message}`)
          return null
        })
      : null,
    summarize(result.title ?? titleHint ?? file.title, text, {
      wantTitle: looksLikeFileName(file.title) && !result.title,
    }).catch((error: Error) => {
      console.warn(`[details] ${file.id} summary: ${error.message}`)
      return {} as { summary?: string; title?: string }
    }),
  ])
  const meta: FileMeta = {
    ...previous,
    ...(found ?? {}),
    summary: summary.summary ?? previous.summary,
  }
  // A file still named by its file name takes the paper's title, else one read from its content.
  const better = found?.csl?.title ?? summary.title
  return { meta, title: better && looksLikeFileName(file.title) ? better : undefined }
}

// ------------------------------------------------------------------ the job

/**
 * Upload → bytes → duplicate check → read (convert / OCR / transcribe) → passages → embeddings →
 * Zetaris evidence → Ready. Each stage is written to the file row, so the library shows it live.
 */
export async function ingestFile(fileId: string, { lastAttempt = true } = {}): Promise<void> {
  let file = await db.query.files.findFirst({ where: eq(files.id, fileId) })
  if (!file || file.deletedAt) return
  // A note is always ready to edit: it is only re-read for chat, never "processing".
  if (file.kind === "note") return indexNote(fileId)
  await update(fileId, {
    status: "processing",
    stage: "Starting",
    progress: 0,
    problem: null,
    problemDetail: null,
  })
  lap(fileId, "Starting")
  try {
    // From a connector (F35): its content comes into storage first, then it's read like an upload.
    if (file.connectionId && !file.originalKey) {
      await stage(fileId, "Fetching from the connected account", 0.03)
      file = await materialize(file)
    }
    // Duplicate check: the same bytes already in this person's library.
    if (file.originalKey) {
      await stage(fileId, "Checking for duplicates", 0.05)
      const digest = sha256(await getBytes(file.originalKey))
      await update(fileId, { sha256: digest })
      const twin = await db.query.files.findFirst({
        where: and(
          eq(files.ownerId, file.ownerId),
          eq(files.sha256, digest),
          ne(files.id, fileId),
          isNull(files.deletedAt),
        ),
      })
      if (twin) {
        await update(fileId, { duplicateOfId: twin.id })
        throw new ProblemError("duplicate", `Already in your library as "${twin.title}"`)
      }
    }

    await stage(fileId, "Reading", 0.25)
    const result = await readSource(file)
    if (result.passages.length === 0)
      throw new ProblemError("no_text", "No readable text was found")

    if (result.rendition) {
      await putBytes(objectKey("renditions", `${fileId}.pdf`), result.rendition, "application/pdf")
    }

    await stage(fileId, `Indexing ${result.passages.length} passages`, 0.6)
    // Details are looked up while the passages are embedded, so they add no time.
    const [, details] = await Promise.all([embed(result.passages), describe(file, result)])
    await db.transaction(async (tx) => {
      await tx.delete(passages).where(eq(passages.fileId, fileId))
      for (let i = 0; i < result.passages.length; i += 200) {
        await tx.insert(passages).values(result.passages.slice(i, i + 200))
      }
    })

    await stage(fileId, "Checking into Zetaris", 0.8)
    await ensureEvidenceTables()
    lap(fileId, "Zetaris: passages")
    const doc: EvidenceDoc = {
      doc_id: fileId,
      kind: file.kind,
      title: details.title ?? (placeholderTitle(file) ? result.title : undefined) ?? file.title,
      pages: groupByPage(result.passages),
    }
    await publishPassages(doc)
    lap(fileId, "Zetaris: PDF text")
    if (result.rendition) await publishPdfText(fileId, result.rendition)
    lap(fileId, "Zetaris: confirm")
    const confirmed = await confirmPublished(fileId)
    if (confirmed !== result.passages.length) {
      throw new Error(`Zetaris holds ${confirmed} of ${result.passages.length} passages`)
    }

    await update(fileId, {
      status: "ready",
      stage: null,
      progress: 1,
      title: details.title ?? (placeholderTitle(file) ? result.title : undefined) ?? file.title,
      kind: result.kind ?? file.kind,
      meta: result.image ? { ...details.meta, ogImage: result.image } : details.meta,
      renditionKey: result.rendition ? objectKey("renditions", `${fileId}.pdf`) : null,
      pages: result.pages ?? null,
      pageCount: result.pages?.length ?? null,
      durationSeconds: result.duration ?? null,
      fromScan: result.fromScan ?? false,
      publishedAt: new Date(),
    })
    // Its polaroid for the wall, made off the critical path (a failed thumb never fails a file).
    await enqueue("thumb", { fileId }, fileId).catch(() => undefined)
    // the spaces it's filed in hear it's ready (a shared wall updates live)
    await fileSpaceEvents(db, fileId, "source_ready", file.ownerId).catch(() => undefined)
  } catch (error) {
    const problem =
      error instanceof ProblemError
        ? error.problem
        : error instanceof LockedPdfError
          ? "locked_pdf"
          : error instanceof UnreachableError
            ? "unreachable"
            : null
    if (problem) {
      await update(fileId, {
        status: "needs_you",
        stage: null,
        problem,
        problemDetail: (error as Error).message,
      })
      await fileSpaceEvents(db, fileId, "source_failed", file.ownerId).catch(() => undefined)
      return
    }
    // Anything else may be transient (a model or Zetaris hiccup): let pg-boss retry, and only
    // show "Couldn't process" once the retries are spent.
    if (lastAttempt) {
      await update(fileId, {
        status: "needs_you",
        stage: null,
        problem: "failed",
        problemDetail: (error as Error).message.slice(0, 500),
      })
      await fileSpaceEvents(db, fileId, "source_failed", file.ownerId).catch(() => undefined)
    } else {
      await update(fileId, { stage: "Retrying shortly" })
    }
    throw error
  } finally {
    lap(fileId, "")
    console.info(`[ingest] ${fileId} · ${clocks.get(fileId)?.spans.join(" · ")}`)
    clocks.delete(fileId)
  }
}

export function groupByPage(rows: NewPassage[]): EvidenceDoc["pages"] {
  const pages = new Map<number, EvidenceDoc["pages"][number]>()
  for (const row of rows) {
    const page = row.page ?? 0
    if (!pages.has(page)) pages.set(page, { page, passages: [] })
    pages.get(page)?.passages.push({
      pid: row.id,
      kind: row.kind ?? "text",
      text: row.text,
      t_start: row.tStart ?? null,
      t_end: row.tEnd ?? null,
      speaker: row.speaker ?? null,
    })
  }
  return [...pages.values()].sort((a, b) => a.page - b.page)
}
