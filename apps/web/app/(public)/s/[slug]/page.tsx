import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { BrandMark } from "@/components/brand-mark"
import { PublicFolder } from "@/components/public/public-folder"
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
  title: "Shared folder",
  robots: { index: false, follow: false },
}

async function SharedFolder({ params }: Props) {
  const { slug } = await params
  const share = await find(slug)
  if (!share)
    return (
      <main className="grid min-h-svh place-items-center px-6 text-center">
        <div className="max-w-sm">
          <BrandMark className="mx-auto size-10" />
          <h1 className="mt-6 text-heading-xs text-bone-white">This folder isn't shared</h1>
          <p className="mt-3 text-reading text-silver-mist">
            The link may have been turned off by the person who shared it, or mistyped.
          </p>
          <Link href="/" className="mt-6 inline-block text-ui text-electric-iris hover:underline">
            What is Konkyo?
          </Link>
        </div>
      </main>
    )
  return <PublicFolder slug={slug} share={share} />
}

/** A public folder (plan F36), open to anyone with the link; read at request time. */
export default function PublicFolderPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="min-h-svh bg-background" aria-busy />}>
      <SharedFolder params={params} />
    </Suspense>
  )
}
