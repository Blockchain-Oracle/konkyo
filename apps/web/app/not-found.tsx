import { Button } from "@konkyo/ui/components/button"
import type { Metadata } from "next"
import Link from "next/link"
import { SystemPage } from "@/components/system-page"

export const metadata: Metadata = { title: "Not found" }

export default function NotFound() {
  return (
    <SystemPage
      label="404"
      title="This page isn't here"
      actions={
        <Button size="lg" className="px-5" nativeButton={false} render={<Link href="/home" />}>
          Back to Konkyo
        </Button>
      }
    >
      The link may be old, or what it pointed to was moved, deleted or unpublished.
    </SystemPage>
  )
}
