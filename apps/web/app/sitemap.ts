import { APP } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import type { MetadataRoute } from "next"
import { connection } from "next/server"

const { articles, profiles, user } = schema

/** How many articles and pages the sitemap lists (newest first). */
const SITEMAP_MAX = 5_000

/**
 * What search engines may index (plan F57): the landing, the legal pages, every published
 * article and every person's page. Public spaces stay out (they're `noindex`). Read at request
 * time, so a new article is listed at once.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  const [published, people] = await Promise.all([
    db
      .select({ slug: articles.slug, at: articles.updatedAt })
      .from(articles)
      .where(isNull(articles.unpublishedAt))
      .orderBy(desc(articles.updatedAt))
      .limit(SITEMAP_MAX),
    db
      .select({ handle: profiles.handle, at: profiles.updatedAt })
      .from(profiles)
      .innerJoin(user, eq(user.id, profiles.userId))
      .where(and(isNotNull(profiles.handle), eq(user.isAnonymous, false)))
      .orderBy(desc(profiles.updatedAt))
      .limit(SITEMAP_MAX),
  ])
  return [
    { url: APP.url, changeFrequency: "weekly", priority: 1 },
    { url: `${APP.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${APP.url}/terms`, changeFrequency: "yearly", priority: 0.2 },
    ...published.map((a) => ({
      url: `${APP.url}/a/${a.slug}`,
      lastModified: a.at,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...people.map((p) => ({
      url: `${APP.url}/u/${p.handle}`,
      lastModified: p.at,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ]
}
