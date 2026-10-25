import type { Metadata } from "next"
import Link from "next/link"
import { SystemPage } from "@/components/system-page"

export const metadata: Metadata = { title: "Not found" }

export default function NotFound() {
  return (
    <SystemPage
      sticker="404"
      title="this page isn't here."
      action={
        <Link className="claim-done system-action" href="/home">
          back to konkyo <span aria-hidden="true">→</span>
        </Link>
      }
    >
      The link may be old, or what it pointed to was moved, deleted or unpublished.
    </SystemPage>
  )
}
