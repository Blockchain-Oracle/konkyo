import "server-only"
import { randomBytes } from "node:crypto"
import { bylineOf, moderateAll } from "@konkyo/agents"
import { ARTICLES, type FileMeta, SPACES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import type { ArticleCheck, ArticleLicence } from "@konkyo/db/schema"
import { env } from "@konkyo/env/server"
import { doiFromUrl, openAccessLicence } from "@konkyo/ingest/metadata"
import { enqueue } from "@konkyo/jobs"
import { checkQuotes } from "@konkyo/zetaris"
import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import { citationsIn, docText, type PMNode } from "./export-note"
import { importUrl, LibraryError } from "./library"
import { getNote, logNoteEvent, textHash } from "./notes"
import { type Face, faceOf, getMe } from "./profiles"
import { createSpace } from "./spaces"
import { allowanceLeft } from "./usage"

const {
  articles,
  articleCitations,
  articleLikes,
  articleReports,
  files,
  folders,
  inboxItems,
  noteEvents,
  passages,
  publishAttempts,
} = schema

/*
 * Published articles (plan F57): a note frozen with its citations at /a/<slug>. Publishing needs a
 * kept account with a page, a current "Check my draft" (its counts go on the article, not-founds
 * included) and a clean moderation read; every quote is re-checked in Zetaris at publish.
 */

export type PublishState = {
  noteId: string
  title: string
  citations: number
  words: number
  /** Why publishing is closed right now, said plainly; null when it's open. */
  blocked: string | null
  /** The last "Check my draft", and whether it's of the note as it is now. */
  check: (ArticleCheck & { current: boolean }) | null
  article: {
    id: string
    slug: string
    title: string
    summary: string | null
    showPages: boolean
    published: boolean
    version: number
  } | null
  /** Your cited sources with a page one to use as the cover. */
  covers: { fileId: string; title: string }[]
  /** Citations of sources that aren't yours (a teammate's, in a shared space): only their quote shows. */
  foreign: number
  left: number
}

type NoteCheckData = {
  /** Set only by a check of the saved note (the publish sheet's): the hash of what it read. */
  savedHash?: string
  counts?: Partial<Record<"supported" | "partly" | "contradicted" | "not-found", number>>
}

/** The last check, current only when it checked exactly the saved note's words as they are now. */
async function lastCheck(noteId: string, content: unknown) {
  const [row] = await db
    .select()
    .from(noteEvents)
    .where(and(eq(noteEvents.fileId, noteId), eq(noteEvents.type, "checked")))
    .orderBy(desc(noteEvents.createdAt))
    .limit(1)
  if (!row) return null
  const counts = (row.data as NoteCheckData).counts ?? {}
  const check: ArticleCheck = {
    supported: counts.supported ?? 0,
    partly: counts.partly ?? 0,
    contradicted: counts.contradicted ?? 0,
    notFound: counts["not-found"] ?? 0,
    total:
      (counts.supported ?? 0) +
      (counts.partly ?? 0) +
      (counts.contradicted ?? 0) +
      (counts["not-found"] ?? 0),
    checkedAt: row.createdAt.toISOString(),
  }
  const data = row.data as NoteCheckData
  return {
    ...check,
    current: Boolean(data.savedHash) && data.savedHash === textHash(docText(content)),
  }
}

const lastDay = (ownerId: string) =>
  and(
    eq(publishAttempts.ownerId, ownerId),
    gt(publishAttempts.createdAt, sql`now() - interval '1 day'`),
  )

/** Every publish and republish attempt counts (each runs moderation and re-checks every quote). */
async function publishesLeft(ownerId: string) {
  const [row] = await db.select({ n: count() }).from(publishAttempts).where(lastDay(ownerId))
  return Math.max(0, ARTICLES.perDay - (row?.n ?? 0))
}

/**
 * Take one of today's publishes before any of the slow, paid work, one request at a time per
 * person (an advisory lock), so parallel requests can't all pass the count.
 */
async function spendPublish(ownerId: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`publish:${ownerId}`}))`)
    const [row] = await tx.select({ n: count() }).from(publishAttempts).where(lastDay(ownerId))
    if ((row?.n ?? 0) >= ARTICLES.perDay)
      throw new LibraryError(
        `You've published ${ARTICLES.perDay} times today. Try again tomorrow.`,
        429,
      )
    const [taken] = await tx
      .insert(publishAttempts)
      .values({ ownerId })
      .returning({ id: publishAttempts.id })
    if (!taken) throw new LibraryError("Couldn't publish", 500)
    return taken.id
  })
}

/** The note's citations, numbered by first appearance of each passage. */
function numbered(content: unknown) {
  const seen = new Map<string, Record<string, unknown>>()
  for (const attrs of citationsIn(content as PMNode)) {
    const passageId = attrs.passageId as string | undefined
    if (passageId && !seen.has(passageId)) seen.set(passageId, attrs)
  }
  return [...seen.values()].map((attrs, i) => ({ n: i + 1, attrs }))
}

/** What the publish sheet shows for a note. */
export async function publishState(ownerId: string, noteId: string): Promise<PublishState> {
  const [note, me, existing] = await Promise.all([
    getNote(ownerId, noteId),
    getMe(ownerId),
    db.query.articles.findFirst({
      where: and(eq(articles.noteFileId, noteId), eq(articles.authorId, ownerId)),
    }),
  ])
  const cited = numbered(note.content)
  const own = await ownPassages(
    ownerId,
    cited.map((c) => c.attrs.passageId as string),
  )
  const ownFiles = [...new Map([...own.values()].map((r) => [r.file.id, r.file])).values()]
  const covers = ownFiles.filter((f) => f.thumbKey).map((f) => ({ fileId: f.id, title: f.title }))
  // everything that will show: the body and every quote (moderation reads all of it)
  const shownChars =
    docText(note.content).length +
    cited.reduce((sum, c) => sum + String(c.attrs.quote ?? "").length, 0)
  const left = await publishesLeft(ownerId)
  const blocked = me.isGuest
    ? "Publishing needs a kept account: keep yours with Google first."
    : !me.handle
      ? "Claim a handle first (your face on the rail, then your page): articles live on it."
      : left === 0
        ? `You've published ${ARTICLES.perDay} times today. Try again tomorrow.`
        : !note.words
          ? "There's nothing to publish yet."
          : shownChars > ARTICLES.moderateChunk * ARTICLES.moderateChunks
            ? `Articles can be up to ${(ARTICLES.moderateChunk * ARTICLES.moderateChunks).toLocaleString("en")} characters. This note is longer: publish a shorter version.`
            : null
  return {
    noteId,
    title: note.title,
    citations: cited.length,
    words: note.words,
    blocked,
    check: await lastCheck(noteId, note.content),
    article: existing
      ? {
          id: existing.id,
          slug: existing.slug,
          title: existing.title,
          summary: existing.summary,
          showPages: existing.showPages,
          published: !existing.unpublishedAt,
          version: existing.version,
        }
      : null,
    covers: covers.slice(0, 6),
    foreign: cited.filter((c) => !own.has(c.attrs.passageId as string)).length,
    left,
  }
}

/**
 * The cited passages that are the author's own, with their files. Only these are published with
 * their words around the quote, their source record and their page: a note can name any passage
 * id, and a teammate's file in a shared space isn't the author's to publish.
 */
async function ownPassages(ownerId: string, passageIds: string[]) {
  const ids = [...new Set(passageIds.filter(Boolean))]
  const rows = ids.length
    ? await db
        .select({ passage: passages, file: files })
        .from(passages)
        .innerJoin(files, eq(files.id, passages.fileId))
        .where(
          and(
            inArray(passages.id, ids),
            eq(passages.ownerId, ownerId),
            eq(files.ownerId, ownerId),
            isNull(files.deletedAt),
          ),
        )
    : []
  return new Map(rows.map((r) => [r.passage.id, r]))
}

const kebab = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, ARTICLES.slugMax)
    .replace(/-+$/, "") || "article"

const tail = () =>
  randomBytes(8)
    .toString("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, ARTICLES.slugRandom)

/** The text around a quote, at most this long, for the citation card. */
function around(text: string, quote: string) {
  const max = ARTICLES.contextChars
  if (text.length <= max) return text
  const at = Math.max(0, text.indexOf(quote))
  const start = Math.max(0, at - Math.floor((max - quote.length) / 2))
  const slice = text.slice(start, start + max)
  return `${start > 0 ? "… " : ""}${slice}${start + max < text.length ? " …" : ""}`
}

export async function publishNote(
  ownerId: string,
  noteId: string,
  input: { title: string; summary?: string | null; showPages: boolean; coverFileId?: string },
) {
  const state = await publishState(ownerId, noteId)
  if (state.blocked) throw new LibraryError(state.blocked, 403)
  if (input.coverFileId && !state.covers.some((c) => c.fileId === input.coverFileId))
    throw new LibraryError("The cover has to be page one of one of your cited sources", 400)
  // Everything below reads this one copy of the note: the check must be of it, and it's what
  // moderation reads and what publishes.
  const note = await getNote(ownerId, noteId)
  const check = await lastCheck(noteId, note.content)
  if (!check?.current)
    throw new LibraryError("Check it first: publishing shows what the check found.", 409)
  const cited = numbered(note.content)
  const body = docText(note.content)
  const shown = [body, ...cited.map((c) => String(c.attrs.quote ?? ""))].join("\n\n")
  const most = ARTICLES.moderateChunk * ARTICLES.moderateChunks
  if (shown.length > most)
    throw new LibraryError(
      `Articles can be up to ${most.toLocaleString("en")} characters. Publish a shorter version.`,
      400,
    )
  const attempt = await spendPublish(ownerId)

  const title = input.title.trim().slice(0, ARTICLES.titleMax) || note.title || "Untitled"
  const summary = input.summary?.trim().slice(0, ARTICLES.summaryMax) || null
  const own = await ownPassages(
    ownerId,
    cited.map((c) => c.attrs.passageId as string),
  )

  // Moderation reads every word that will show (title, summary, body, each quote) in one request.
  // If it can't be reached, nothing is published.
  const pieces = [
    [title, summary].filter(Boolean).join("\n"),
    ...Array.from({ length: Math.ceil(shown.length / ARTICLES.moderateChunk) }, (_, i) =>
      shown.slice(i * ARTICLES.moderateChunk, (i + 1) * ARTICLES.moderateChunk),
    ),
  ]
  const moderation = await moderateAll(pieces)
  if (moderation.flagged)
    throw new LibraryError("This can't be published: it reads as against the content rules.", 400)
  if (!moderation.checked) {
    // nothing paid ran: the try is given back
    await db.delete(publishAttempts).where(eq(publishAttempts.id, attempt))
    throw new LibraryError(
      "The content check couldn't run just now, so nothing was published. Try again in a minute.",
      503,
    )
  }

  // The citations, frozen: the author's own passages with their source record, licence and a
  // fresh Zetaris check; anything else keeps only its quote.
  const quotes = cited.flatMap(({ n, attrs }) => {
    const row = own.get(attrs.passageId as string)
    return row && attrs.quote
      ? [
          {
            qid: String(n),
            fileId: row.file.id,
            passageId: row.passage.id,
            quote: String(attrs.quote),
            transcript: row.passage.kind === "transcript",
          },
        ]
      : []
  })
  const checked = await checkQuotes(quotes).catch(() => ({ found: new Set<string>() }))
  const licences = new Map<string, ArticleLicence | null>()
  const citationRows = await Promise.all(
    cited.map(async ({ n, attrs }) => {
      const row = own.get(attrs.passageId as string)
      const quote = String(attrs.quote ?? "")
      if (!row)
        return {
          n,
          fileId: null,
          passageId: null,
          quote,
          context: null,
          page: null,
          tStart: null,
          title: "A source outside the author's library",
          byline: null,
          csl: null,
          doi: null,
          url: null,
          licence: null,
          open: false,
          verified: false,
        }
      const meta = (row.file.meta ?? {}) as FileMeta
      const doi = meta.csl?.DOI ?? doiFromUrl(row.file.sourceUrl) ?? null
      let licence: ArticleLicence | null = meta.licence
        ? { name: meta.licence.name, url: meta.licence.url, open: true }
        : null
      if (!licence && doi) {
        if (!licences.has(doi)) licences.set(doi, await openAccessLicence(doi))
        licence = licences.get(doi) ?? null
      }
      return {
        n,
        fileId: row.file.id,
        passageId: row.passage.id,
        quote,
        context: around(row.passage.text, quote),
        page: row.passage.page,
        tStart: row.passage.tStart,
        title: row.file.title,
        byline: bylineOf(meta) ?? null,
        csl: meta.csl ?? null,
        doi,
        // the publisher's page first: a reader expects the paper, not the index record
        url: doi ? `https://doi.org/${doi}` : (row.file.sourceUrl ?? null),
        licence,
        open: Boolean(licence?.open),
        verified: checked.found.has(String(n)),
      }
    }),
  )

  const article = await db.transaction(async (tx) => {
    // one writer per note: two publishes at once become a publish and a republish
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`article:${noteId}`}))`)
    const [existing] = await tx
      .select()
      .from(articles)
      .where(and(eq(articles.noteFileId, noteId), eq(articles.authorId, ownerId)))
      .limit(1)
    const values = {
      title,
      summary,
      content: note.content,
      text: body,
      words: note.words,
      check: (({ current: _c, ...c }) => c)(check),
      showPages: input.showPages,
      // no cover chosen: none shows; a chosen one keeps the old until the worker copies it
      ...(input.coverFileId ? {} : { coverKey: null }),
      moderation,
      updatedAt: new Date(),
      unpublishedAt: null,
    }
    const [saved] = existing
      ? await tx
          .update(articles)
          .set({ ...values, version: existing.version + 1 })
          .where(eq(articles.id, existing.id))
          .returning()
      : await tx
          .insert(articles)
          .values({
            ...values,
            authorId: ownerId,
            noteFileId: noteId,
            slug: `${kebab(title)}-${tail()}`,
          })
          .returning()
    if (!saved) throw new LibraryError("Couldn't publish", 500)
    // A page already drawn for the last version stays, so a republished article never shows
    // its cards without pages while the worker runs.
    const drawn = new Map(
      (
        await tx
          .select({
            fileId: articleCitations.fileId,
            page: articleCitations.page,
            key: articleCitations.pageImageKey,
          })
          .from(articleCitations)
          .where(eq(articleCitations.articleId, saved.id))
      ).flatMap((c) => (c.key ? [[`${c.fileId}:${c.page}`, c.key] as const] : [])),
    )
    await tx.delete(articleCitations).where(eq(articleCitations.articleId, saved.id))
    if (citationRows.length)
      await tx.insert(articleCitations).values(
        citationRows.map((c) => ({
          ...c,
          articleId: saved.id,
          pageImageKey:
            c.fileId && (c.open || input.showPages)
              ? (drawn.get(`${c.fileId}:${c.page}`) ?? null)
              : null,
        })),
      )
    return saved
  })
  await logNoteEvent(ownerId, noteId, "published", {
    slug: article.slug,
    title: article.title,
    version: article.version,
  })
  await enqueue(
    "articleAssets",
    { articleId: article.id, version: article.version, coverFileId: input.coverFileId },
    `${article.id}:${article.version}`,
  )
  return { slug: article.slug, path: `/a/${article.slug}`, version: article.version }
}

/**
 * The link stops working at once; publishing again brings the same address back. By id (the
 * publish sheet) or by slug (the article's own page, which works even once its note is gone).
 */
export async function unpublish(ownerId: string, which: { id: string } | { slug: string }) {
  const [gone] = await db
    .update(articles)
    .set({ unpublishedAt: new Date() })
    .where(
      and(
        "id" in which ? eq(articles.id, which.id) : eq(articles.slug, which.slug),
        eq(articles.authorId, ownerId),
      ),
    )
    .returning({ id: articles.id })
  if (!gone) throw new LibraryError("No such article", 404)
}

/**
 * The body as readers get it: each citation carries only its number (by its passage's first
 * appearance, as publishing numbered them), never the author's file and passage ids or quote.
 */
function publicContent(content: unknown): unknown {
  const order = new Map<string, number>()
  const walk = (node: PMNode): PMNode | null => {
    if (node.type === "citation") {
      const id = String(node.attrs?.passageId ?? "")
      if (!id) return null
      if (!order.has(id)) order.set(id, order.size + 1)
      return { type: "citation", attrs: { n: order.get(id) } }
    }
    if (!node.content) return node
    return {
      ...node,
      content: node.content.map(walk).filter((n): n is PMNode => n !== null),
    }
  }
  return walk(content as PMNode)
}

export type ArticleCitation = {
  n: number
  quote: string
  context: string | null
  page: number | null
  tStart: number | null
  title: string
  byline: string | null
  doi: string | null
  url: string | null
  licence: ArticleLicence | null
  verified: boolean
  /** The cited page as an image, when it may be shown. */
  pageImage: string | null
}

export type PublicArticle = {
  id: string
  slug: string
  title: string
  summary: string | null
  content: unknown
  words: number
  check: ArticleCheck | null
  cover: string | null
  publishedAt: string
  updatedAt: string
  author: { userId: string; name: string; handle: string; face: Face }
  citations: ArticleCitation[]
  likes: number
  liked: boolean
  yours: boolean
}

/** An article for anyone (signed in or not); null when unpublished or gone. */
export async function publicArticle(
  slug: string,
  viewerId: string | null,
): Promise<PublicArticle | null> {
  const [row] = await db
    .select({ article: articles, author: schema.user, profile: schema.profiles })
    .from(articles)
    .innerJoin(schema.user, eq(schema.user.id, articles.authorId))
    .leftJoin(schema.profiles, eq(schema.profiles.userId, articles.authorId))
    .where(and(eq(articles.slug, slug), isNull(articles.unpublishedAt)))
    .limit(1)
  if (!row?.profile?.handle) return null
  const a = row.article
  const [cites, [likes], liked] = await Promise.all([
    db
      .select()
      .from(articleCitations)
      .where(eq(articleCitations.articleId, a.id))
      .orderBy(articleCitations.n),
    db.select({ n: count() }).from(articleLikes).where(eq(articleLikes.articleId, a.id)),
    viewerId
      ? db.query.articleLikes.findFirst({
          where: and(eq(articleLikes.articleId, a.id), eq(articleLikes.userId, viewerId)),
        })
      : Promise.resolve(undefined),
  ])
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    content: publicContent(a.content),
    words: a.words,
    check: a.check,
    cover: a.coverKey ? `/api/a/${a.slug}/cover?v=${a.version}` : null,
    publishedAt: a.publishedAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    author: {
      userId: row.author.id,
      name: row.author.name,
      handle: row.profile.handle,
      face: faceOf(row.author, row.profile),
    },
    citations: cites.map((c) => ({
      n: c.n,
      quote: c.quote,
      context: c.context,
      page: c.page,
      tStart: c.tStart,
      title: c.title,
      byline: c.byline,
      doi: c.doi,
      url: c.url,
      licence: c.licence,
      verified: c.verified,
      pageImage: c.pageImageKey ? `/api/a/${a.slug}/cite/${c.n}/page?v=${a.version}` : null,
    })),
    likes: likes?.n ?? 0,
    liked: Boolean(liked),
    yours: viewerId === a.authorId,
  }
}

/** The storage key behind an article's cover or a cited page image (public, while published). */
export async function articleImageKey(slug: string, n: number | null) {
  const a = await db.query.articles.findFirst({
    where: and(eq(articles.slug, slug), isNull(articles.unpublishedAt)),
  })
  if (!a) return null
  if (n === null) return a.coverKey
  const c = await db.query.articleCitations.findFirst({
    where: and(eq(articleCitations.articleId, a.id), eq(articleCitations.n, n)),
  })
  return c?.pageImageKey ?? null
}

async function liveArticle(slug: string) {
  const a = await db.query.articles.findFirst({
    where: and(eq(articles.slug, slug), isNull(articles.unpublishedAt)),
  })
  if (!a) throw new LibraryError("That article isn't published", 404)
  return a
}

/** ♥ (kept accounts, as following is). */
export async function like(viewerId: string, slug: string, on: boolean) {
  const me = await getMe(viewerId)
  if (me.isGuest)
    throw new LibraryError("Liking needs a kept account: keep yours with Google.", 403)
  const a = await liveArticle(slug)
  if (on)
    await db
      .insert(articleLikes)
      .values({ articleId: a.id, userId: viewerId })
      .onConflictDoNothing()
  else
    await db
      .delete(articleLikes)
      .where(and(eq(articleLikes.articleId, a.id), eq(articleLikes.userId, viewerId)))
  const [row] = await db
    .select({ n: count() })
    .from(articleLikes)
    .where(eq(articleLikes.articleId, a.id))
  return { likes: row?.n ?? 0, liked: on }
}

/**
 * A reader's report: stored once per reader and article, and put in the Inbox of everyone in
 * ADMIN_USER_IDS with the reason and a link to the article.
 */
export async function report(viewerId: string, slug: string, reason: string) {
  const a = await liveArticle(slug)
  const again = await db.query.articleReports.findFirst({
    where: and(eq(articleReports.articleId, a.id), eq(articleReports.reporterId, viewerId)),
    columns: { id: true },
  })
  if (again) return
  await db.insert(articleReports).values({ articleId: a.id, reporterId: viewerId, reason })
  const admins = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  if (admins.length)
    await db.insert(inboxItems).values(
      admins.map((ownerId) => ({
        ownerId,
        kind: "system" as const,
        title: `An article was reported: “${a.title.slice(0, 120)}”`,
        body: reason,
        href: `/a/${a.slug}`,
      })),
    )
}

/**
 * "Save these sources": a new space in the reader's library with the article's sources, imported
 * by their DOI or address (a guest gets a guest library). Sources with neither stay behind.
 */
export async function saveSources(viewerId: string, slug: string) {
  const a = await liveArticle(slug)
  const cites = await db
    .select({
      fileId: articleCitations.fileId,
      doi: articleCitations.doi,
      url: articleCitations.url,
      title: articleCitations.title,
    })
    .from(articleCitations)
    .where(eq(articleCitations.articleId, a.id))
  // the author's own uploads (a recording, a scan) have no address anyone else can fetch
  const unlinked = new Set(cites.filter((c) => !c.doi && !c.url).map((c) => c.fileId ?? c.title))
    .size
  const links = [
    ...new Map(
      cites
        .map((c) => ({ href: c.doi ? `https://doi.org/${c.doi}` : c.url, title: c.title }))
        .filter((c): c is { href: string; title: string } => Boolean(c.href))
        .map((c) => [c.href, c]),
    ).values(),
  ]
  if (!links.length) throw new LibraryError("None of its sources has a public address to save", 409)
  const limited = await allowanceLeft(viewerId, "files")
  if (limited) throw new LibraryError(limited, 429)
  const color =
    (Object.keys(SPACES.colors) as (keyof typeof SPACES.colors)[])[a.title.length % 6] ?? "violet"
  const space = await createSpace(viewerId, {
    name: a.title.slice(0, 80),
    color,
    wall: SPACES.defaultWall[color] as never,
    symbol: "✎",
    templateId: "article",
    description: `The sources of “${a.title.slice(0, 120)}”`,
  })
  let saved = 0
  for (const link of links) {
    try {
      await importUrl(viewerId, link.href, space.id, { title: link.title })
      saved++
    } catch (error) {
      // the reader's daily file allowance: stop, what's in is in
      if (error instanceof LibraryError && error.status === 429) break
    }
  }
  if (!saved) {
    // nothing came in: don't leave an empty space behind
    await db.delete(folders).where(and(eq(folders.id, space.id), eq(folders.ownerId, viewerId)))
    throw new LibraryError("None of its sources could be added just now. Try again later.", 502)
  }
  return { spaceId: space.id, saved, total: links.length, unlinked }
}

/** Your articles (the profile tab and the Home feed of people you follow). */
export async function articlesBy(authorId: string) {
  return db
    .select({
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      words: articles.words,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      check: articles.check,
      coverKey: articles.coverKey,
      version: articles.version,
    })
    .from(articles)
    .where(and(eq(articles.authorId, authorId), isNull(articles.unpublishedAt)))
    .orderBy(desc(articles.publishedAt))
    .limit(50)
}
