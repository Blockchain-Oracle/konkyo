import { ARTICLES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { and, eq, isNull } from "drizzle-orm"
import { route } from "@/lib/api"
import { LibraryError } from "@/lib/library"
import { getSettings } from "@/lib/settings"
import { speak } from "@/lib/voice-server"

/**
 * ▶ listen to an article: its opening read aloud. The text comes from the article itself, never
 * the request, so this can't be used to read anything else.
 */
export const POST = route<{ slug: string }>(async ({ userId, params }) => {
  const article = await db.query.articles.findFirst({
    where: and(eq(schema.articles.slug, params.slug), isNull(schema.articles.unpublishedAt)),
  })
  if (!article) throw new LibraryError("That article isn't published", 404)
  const text = `${article.title}. ${article.text}`.slice(0, ARTICLES.listenChars)
  const clip = await speak(userId, text, "speaker", (await getSettings(userId)).voiceId)
  return { url: `/api/voice/clip/${clip.hash}`, words: clip.words }
})
