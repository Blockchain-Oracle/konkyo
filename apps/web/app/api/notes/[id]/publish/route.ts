import { ARTICLES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { route } from "@/lib/api"
import { publishNote, publishState, unpublish } from "@/lib/articles"
import { LibraryError } from "@/lib/library"

const noteId = (params: { id: string }) => z.uuid().parse(params.id)

/** What the publish sheet shows: who may publish, the last check, the article if there is one. */
export const GET = route<{ id: string }>(async ({ userId, params }) =>
  publishState(userId, noteId(params)),
)

/** Publish (or republish) the note as an article. */
export const POST = route<
  { id: string },
  { title: string; summary?: string | null; showPages: boolean; coverFileId?: string }
>(
  async ({ userId, params, body }) => publishNote(userId, noteId(params), body),
  z.object({
    title: z.string().trim().min(1).max(ARTICLES.titleMax),
    summary: z.string().trim().max(ARTICLES.summaryMax).nullable().optional(),
    showPages: z.boolean().default(false),
    coverFileId: z.uuid().optional(),
  }),
)

/** Unpublish: the link stops working; publishing again revives it. */
export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  const article = await db.query.articles.findFirst({
    where: and(
      eq(schema.articles.noteFileId, noteId(params)),
      eq(schema.articles.authorId, userId),
    ),
  })
  if (!article) throw new LibraryError("This note isn't published", 404)
  await unpublish(userId, { id: article.id })
})
