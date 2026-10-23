import { createHash } from "node:crypto"
import { INGEST } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import {
  articleToPdf,
  documentHtml,
  embeddingHash,
  embedTexts,
  extractPassages,
  fetchSource,
  fetchYouTube,
  htmlToPdf,
  isYouTube,
  LockedPdfError,
  markdownToPdf,
  ocrPdf,
  officeToPdf,
  openPdf,
  renderRGBA,
  textToHtml,
  transcribe,
  UnreachableError,
  type Word,
  wordsToPassages,
} from "@konkyo/ingest"
import { getBytes, objectKey, putBytes } from "@konkyo/storage"
import {
  confirmPublished,
  type EvidenceDoc,
  ensureEvidenceTables,
  publishPassages,
  publishPdfText,
} from "@konkyo/zetaris"
import { and, eq, inArray, isNull, ne } from "drizzle-orm"

const { files, passages, embeddingCache } = schema

type FileRow = typeof files.$inferSelect
type NewPassage = typeof passages.$inferInsert

/** Problems the person has to act on: no point retrying them. */
class ProblemError extends Error {
  constructor(
    readonly problem: NonNullable<FileRow["problem"]>,
    message: string,
  ) {
    super(message)
  }
}

type DocResult = {
  passages: NewPassage[]
  rendition?: Uint8Array
  pages?: FileRow["pages"]
  fromScan?: boolean
  title?: string
  duration?: number
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
    title:
      metaTitle && metaTitle.length > 3 && !/^untitled|microsoft word/i.test(metaTitle)
        ? metaTitle
        : undefined,
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
    case "web": {
      if (!file.sourceUrl) throw new Error("Web import has no URL")
      await stage(file.id, "Fetching the page", 0.1)
      const source = await fetchSource(file.sourceUrl)
      if (source.contentType.includes("pdf")) return fromPdf(file, source.bytes, PDF_HYPHENS.pdf)
      if (!source.contentType.includes("html")) {
        throw new ProblemError(
          "unsupported",
          `This link serves ${source.contentType || "an unknown type"}`,
        )
      }
      await stage(file.id, "Saving the article as a PDF", 0.2)
      const article = await articleToPdf(new TextDecoder().decode(source.bytes), source.finalUrl)
      const result = await fromPdf(file, article.pdf, PDF_HYPHENS.converted)
      return { ...result, title: article.title }
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
async function embed(rows: NewPassage[]): Promise<number> {
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

// ------------------------------------------------------------------ the job

/**
 * Upload → bytes → duplicate check → read (convert / OCR / transcribe) → passages → embeddings →
 * Zetaris evidence → Ready. Each stage is written to the file row, so the library shows it live.
 */
export async function ingestFile(fileId: string, { lastAttempt = true } = {}): Promise<void> {
  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) })
  if (!file || file.deletedAt) return
  await update(fileId, {
    status: "processing",
    stage: "Starting",
    progress: 0,
    problem: null,
    problemDetail: null,
  })
  lap(fileId, "Starting")
  try {
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
    await embed(result.passages)
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
      title: result.title ?? file.title,
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
      title: result.title ?? file.title,
      renditionKey: result.rendition ? objectKey("renditions", `${fileId}.pdf`) : null,
      pages: result.pages ?? null,
      pageCount: result.pages?.length ?? null,
      durationSeconds: result.duration ?? null,
      fromScan: result.fromScan ?? false,
      publishedAt: new Date(),
    })
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

function groupByPage(rows: NewPassage[]): EvidenceDoc["pages"] {
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
