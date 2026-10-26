import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { files } from "./library"

/** What publishing's check found, shown on the article as it is. */
export type ArticleCheck = {
  supported: number
  partly: number
  contradicted: number
  notFound: number
  total: number
  checkedAt: string
}

/** A source's licence, from OpenAlex's best open-access location when it has one. */
export type ArticleLicence = { name: string | null; url: string | null; open: boolean }

/**
 * A published note: a frozen snapshot of its words and citations at publish, at
 * /a/<slug> for anyone. Republishing replaces the snapshot (`version` goes up, the slug stays);
 * unpublishing kills the link but keeps the row, so publishing again revives the same address.
 */
export const articles = pgTable(
  "articles",
  {
    id: uuid().defaultRandom().primaryKey(),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The note it came from (gone if the note is deleted; the article stays published). */
    noteFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** kebab(title) + 6 random characters, stable across republishing. */
    slug: text().notNull().unique(),
    title: text().notNull(),
    summary: text(),
    /** covers/articles/<id>/<rand>.webp: the note's own image or a cited source's page one. */
    coverKey: text(),
    /** The Tiptap document, rendered by a whitelist (never raw HTML). */
    content: jsonb().notNull(),
    text: text().notNull(),
    words: integer().notNull(),
    check: jsonb().$type<ArticleCheck>(),
    /** Show page images of sources that aren't openly licensed (the author's call). */
    showPages: boolean().default(false).notNull(),
    moderation: jsonb().$type<{ flagged: boolean; categories: string[]; checked: boolean }>(),
    version: integer().default(1).notNull(),
    publishedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    unpublishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("articles_author_idx").on(t.authorId, t.publishedAt),
    // one article per note: a second publish is a republish
    uniqueIndex("articles_note_idx").on(t.noteFileId),
  ],
)

/** One citation of an article, frozen at publish with what a reader needs to open it. */
export const articleCitations = pgTable(
  "article_citations",
  {
    articleId: uuid()
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    n: integer().notNull(),
    fileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** The passage's id in the source's index (<fileId>:p<page>:<n>). */
    passageId: text(),
    quote: text().notNull(),
    /** The passage around the quote (≤600 characters), for the card. */
    context: text(),
    page: integer(),
    tStart: real(),
    title: text().notNull(),
    byline: text(),
    csl: jsonb(),
    doi: text(),
    url: text(),
    licence: jsonb().$type<ArticleLicence>(),
    /** Openly licensed: its page image may be shown. */
    open: boolean().default(false).notNull(),
    /** articles/<id>/<n>.webp, the cited page, only when open or the author allowed it. */
    pageImageKey: text(),
    /** The quote re-checked against the source in Zetaris at publish. */
    verified: boolean().default(false).notNull(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.n] })],
)

export const articleLikes = pgTable(
  "article_likes",
  {
    articleId: uuid()
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.userId] })],
)

/** A reader's report of an article; it lands in the admin's inbox. */
export const articleReports = pgTable("article_reports", {
  id: uuid().defaultRandom().primaryKey(),
  articleId: uuid()
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  reporterId: text().references(() => user.id, { onDelete: "set null" }),
  reason: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

/**
 * Every publish and republish attempt, for the daily limit (each one runs moderation, OpenAlex and
 * a Zetaris check). Written before that work and kept when the note or article goes, so deleting
 * one doesn't hand the allowance back.
 */
export const publishAttempts = pgTable(
  "publish_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("publish_attempts_owner_idx").on(t.ownerId, t.createdAt)],
)
