"use client"

import { Button } from "@konkyo/ui/components/button"
import Link from "next/link"
import { useEffect } from "react"
import { SystemPage } from "@/components/system-page"

/** A page that failed to render: say so plainly, offer another try, and a way back. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <SystemPage
      label="Something went wrong"
      title="This page didn't load"
      actions={
        <>
          <Button size="lg" className="px-5" onClick={reset}>
            Try again
          </Button>
          <Button
            size="lg"
            className="px-5"
            variant="ghost"
            nativeButton={false}
            render={<Link href="/home" />}
          >
            Back to Konkyo
          </Button>
        </>
      }
    >
      Your files and work are saved. Try again; if it keeps happening, it's on our side.
      {error.digest ? ` (Reference ${error.digest})` : ""}
    </SystemPage>
  )
}
