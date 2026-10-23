import type { FileMeta } from "@konkyo/config"
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

/** Embedding width of text-embedding-3-small (the only embedding model; plan §4). */
export const EMBEDDING_DIMENSIONS = 1536

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" })

export const owner = () =>
  text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** Set when moved to Trash; purged after 30 days. */
  deletedAt: timestamp({ withTimezone: true }),
  /** Everything trashed in one action (a folder with its files) shares this id, so it is restored together. */
  trashBatch: uuid(),
}

export const folders = pgTable(
  "folders",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: owner(),
    parentId: uuid().references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
    name: text().notNull(),
    ...timestamps,
  },
  (t) => [index("folders_owner_parent_idx").on(t.ownerId, t.parentId)],
)

export const fileKind = pgEnum("file_kind", [
  "pdf",
  "docx",
  "pptx",
  "markdown",
  "text",
  "web",
  "youtube",
  "audio",
  "video",
  "note",
])

/** Where a file is in its life (plan F03): one word the UI can show, plus a stage while working. */
export const fileStatus = pgEnum("file_status", ["queued", "processing", "ready", "needs_you"])

/** Why a file needs the person, each with its own fix-it action in the UI. */
export const fileProblem = pgEnum("file_problem", [
  "locked_pdf",
  "unsupported",
  "unreachable",
  "duplicate",
  "no_text",
  "failed",
])

export const files = pgTable(
  "files",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: owner(),
    title: text().notNull(),
    kind: fileKind().notNull(),
    mime: text(),
    sizeBytes: integer(),
    /** SHA-256 of the original bytes: duplicates are caught per owner. */
    sha256: text(),
    sourceUrl: text(),
    /** S3 key of the uploaded original (absent for URL imports until fetched). */
    originalKey: text(),
    /** S3 key of the PDF every document is shown as (DOCX/PPTX/web are converted). */
    renditionKey: text(),
    status: fileStatus().default("queued").notNull(),
    /** What the worker is doing right now, in plain words ("Reading pages"). */
    stage: text(),
    progress: real(),
    problem: fileProblem(),
    problemDetail: text(),
    duplicateOfId: uuid(),
    /** "Text from scan": pages had no text layer and were OCR'd. */
    fromScan: boolean().default(false).notNull(),
    /** Only an abstract was available (e.g. a paper without an open PDF). */
    abstractOnly: boolean().default(false).notNull(),
    pageCount: integer(),
    durationSeconds: real(),
    /** Page sizes and rotations, for placing highlight boxes: [{page,width,height,rotate}] */
    pages: jsonb().$type<{ page: number; width: number; height: number; rotate: number }[]>(),
    /** The citation record (CSL-JSON), a short summary, and where they came from. */
    meta: jsonb().$type<FileMeta>(),
    /** When Zetaris confirmed this file's passages (the evidence store has it). */
    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("files_owner_created_idx").on(t.ownerId, t.createdAt),
    index("files_owner_sha_idx").on(t.ownerId, t.sha256),
  ],
)

/** A file can sit in several folders ("Already in Folder X — add here too?"). */
export const fileFolders = pgTable(
  "file_folders",
  {
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    folderId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    addedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fileId, t.folderId] }),
    index("file_folders_folder_idx").on(t.folderId),
  ],
)

export type Box = [number, number, number, number]

/**
 * The unit of evidence: a run of text on one page (or one stretch of a recording) with the boxes
 * that cover it. `id` is the stable passage id shared with Zetaris (`<fileId>:p<page>:<n>`).
 */
export const passages = pgTable(
  "passages",
  {
    id: text().primaryKey(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    ownerId: owner(),
    ordinal: integer().notNull(),
    page: integer(),
    kind: text().default("text").notNull(),
    text: text().notNull(),
    charStart: integer(),
    charEnd: integer(),
    /** One box per line, PDF points, origin top-left of the crop box, unrotated (EmbedPDF's frame). */
    bboxes: jsonb().$type<Box[]>(),
    /** Offsets of each line inside `text`, for quote-level highlights. */
    lineStarts: jsonb().$type<number[]>(),
    tStart: real(),
    tEnd: real(),
    speaker: text(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
    tsv: tsvector().generatedAlwaysAs(sql`to_tsvector('english', text)`),
  },
  (t) => [
    index("passages_file_idx").on(t.fileId, t.ordinal),
    index("passages_owner_idx").on(t.ownerId),
    index("passages_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("passages_tsv_idx").using("gin", t.tsv),
  ],
)

/** Embeddings keyed by a hash of model + text, so the same passage is never embedded twice. */
export const embeddingCache = pgTable("embedding_cache", {
  hash: text().primaryKey(),
  embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

/** Text the person marked in a source (plan F08 Highlight): rects in the page's frame, like passages. */
export const highlights = pgTable(
  "highlights",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: owner(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    page: integer().notNull(),
    /** One box per line segment, PDF points, origin top-left, unrotated (EmbedPDF's frame). */
    rects: jsonb().$type<Box[]>().notNull(),
    text: text().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("highlights_file_idx").on(t.fileId, t.page),
    index("highlights_owner_idx").on(t.ownerId),
  ],
)
