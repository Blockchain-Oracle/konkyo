import { APP } from "@konkyo/config"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"
import { ArticleView } from "@/components/articles/article-view"
import { BrandMark } from "@/components/brand-mark"
import { publicArticle } from "@/lib/articles"
import { relationTo } from "@/lib/people"
import { getSession } from "@/lib/session"

type Props = { params: Promise<{ slug: string }> }

// Static, as /u and /s (a request-time generateMetadata blocks hydration with Cache Components);
// the page sets its own <title> and description, which React hoists into the head.
export const metadata: Metadata = { title: "Article" }

async function Article({ params }: Props) {
  await connection()
  const { slug } = await params
  const session = await getSession()
  const article = await publicArticle(slug, session?.user.id ?? null)
  if (!article)
    return (
      <main className="article-page grid place-items-center">
        <title>{`Not here · ${APP.name}`}</title>
        <div className="me-card" style={{ rotate: "0deg" }}>
          <BrandMark className="size-10" />
          <h1 className="me-name">not here any more</h1>
          <p className="me-bio">This article was unpublished, or the link is wrong.</p>
          <Link className="claim-done" href={"/" as Route}>
            what is konkyo? <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>
    )
  const relation = await relationTo(session?.user.id ?? null, article.author.userId)
  const viewer = !session ? "signed-out" : session.user.isAnonymous ? "guest" : "kept"
  return (
    <>
      <title>{`${article.title} · ${article.author.name} · ${APP.name}`}</title>
      <meta name="description" content={article.summary ?? article.title} />
      <ArticleView article={article} viewer={viewer} relation={relation} />
    </>
  )
}

/** A published article (plan F57), open to anyone. */
export default function ArticlePage({ params }: Props) {
  return (
    <Suspense fallback={<main className="article-page" aria-busy />}>
      <Article params={params} />
    </Suspense>
  )
}
