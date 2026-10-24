import { ARTICLES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { pdfPage } from "@konkyo/ingest"
import type { Payload } from "@konkyo/jobs"
import { deleteObject, getBytes, listKeys, objectKey, putBytes } from "@konkyo/storage"
import { and, eq, sql } from "drizzle-orm"

const { articles, articleCitations, files } = schema

/**
 * An article's pictures (plan F57). The cover is copied (a deleted source mustn't break a
 * published article). A cited page is drawn only for an openly licensed source, or for any
 * source when the author chose to show pages; recordings and web pages have no pages to draw.
 * A page the last version already drew is kept. Every write is tied to this job's version, so a
 * run overtaken by a republish changes nothing; the newest run clears older versions' pictures
 * that nothing uses any more.
 */
export async function makeArticleAssets({
  articleId,
  version,
  coverFileId,
}: Payload<"articleAssets">) {
  const current = () =>
    db.query.articles.findFirst({
      where: and(eq(articles.id, articleId), eq(articles.version, version)),
    })
  const article = await current()
  if (!article || article.unpublishedAt) return
  const stillThisVersion = sql`exists (select 1 from ${articles} where ${articles.id} = ${articleId} and ${articles.version} = ${version})`

  if (coverFileId) {
    // only the author's own file (publishing checked; this keeps the worker honest too)
    const cover = await db.query.files.findFirst({
      where: and(eq(files.id, coverFileId), eq(files.ownerId, article.authorId)),
    })
    if (cover?.thumbKey) {
      const key = objectKey("articles", articleId, `cover-${version}.webp`)
      await putBytes(key, await getBytes(cover.thumbKey), "image/webp")
      await db
        .update(articles)
        .set({ coverKey: key })
        .where(and(eq(articles.id, articleId), eq(articles.version, version)))
    }
  }

  const cited = await db
    .select({ citation: articleCitations, file: files })
    .from(articleCitations)
    .innerJoin(files, eq(files.id, articleCitations.fileId))
    .where(and(eq(articleCitations.articleId, articleId), eq(files.ownerId, article.authorId)))
  const pdfs = new Map<string, Uint8Array>()
  for (const { citation, file } of cited) {
    if (!citation.page || citation.pageImageKey || !(citation.open || article.showPages)) continue
    const pdfKey = file.renditionKey ?? (file.kind === "pdf" ? file.originalKey : null)
    if (!pdfKey) continue
    try {
      if (!pdfs.has(pdfKey)) pdfs.set(pdfKey, await getBytes(pdfKey))
      const image = await pdfPage(pdfs.get(pdfKey) as Uint8Array, citation.page, ARTICLES.pageWidth)
      const key = objectKey("articles", articleId, `${version}-${citation.n}.webp`)
      await putBytes(key, image, "image/webp")
      await db
        .update(articleCitations)
        .set({ pageImageKey: key })
        .where(
          and(
            eq(articleCitations.articleId, articleId),
            eq(articleCitations.n, citation.n),
            eq(articleCitations.fileId, file.id),
            stillThisVersion,
          ),
        )
    } catch (error) {
      console.warn(`[article] page ${citation.page} of ${file.id}`, (error as Error).message)
    }
  }

  // Pictures earlier versions drew that nothing points at any more.
  const now = await current()
  if (!now) return
  const used = new Set(
    [
      now.coverKey,
      ...(
        await db
          .select({ key: articleCitations.pageImageKey })
          .from(articleCitations)
          .where(eq(articleCitations.articleId, articleId))
      ).map((c) => c.key),
    ].filter(Boolean),
  )
  for (const key of await listKeys(`${objectKey("articles", articleId)}/`)) {
    // only older versions' files: a newer run may be writing its own right now
    const drawnFor = Number(key.match(/\/(?:cover-)?(\d+)(?:-\d+)?\.webp$/)?.[1])
    if (!used.has(key) && drawnFor < version) await deleteObject(key).catch(() => undefined)
  }
}
