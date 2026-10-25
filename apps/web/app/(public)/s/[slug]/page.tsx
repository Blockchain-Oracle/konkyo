import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PublicFolder } from "@/components/public/public-folder"
import { SystemPage } from "@/components/system-page"
import { LibraryError } from "@/lib/library"
import { openShare } from "@/lib/shares"

type Props = { params: Promise<{ slug: string }> }

async function find(slug: string) {
  try {
    return await openShare(slug)
  } catch (error) {
    if (error instanceof LibraryError && error.status === 404) return null
    throw error
  }
}

// Shared by link, not published to the web: kept out of search results. Static on purpose: with
// Cache Components a request-time generateMetadata blocked the page from hydrating.
export const metadata: Metadata = {
  title: "Public space",
  robots: { index: false, follow: false },
}

async function SharedFolder({ params }: Props) {
  const { slug } = await params
  const share = await find(slug)
  if (!share)
    return (
      <SystemPage
        sticker="link off"
        title="this space isn't shared."
        action={
          <Link className="claim-done system-action" href="/">
            what is konkyo? <span aria-hidden="true">→</span>
          </Link>
        }
      >
        The link may have been turned off by the person who shared it, or mistyped.
      </SystemPage>
    )
  return <PublicFolder slug={slug} share={share} />
}

/** A public folder (plan F36), open to anyone with the link; read at request time. */
export default function PublicFolderPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="system-page" aria-busy />}>
      <SharedFolder params={params} />
    </Suspense>
  )
}
