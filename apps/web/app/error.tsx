"use client"

import { useEffect } from "react"
import { SystemPage } from "@/components/system-page"

/** A page that failed to render: say so plainly and offer another try (the mark leads home). */
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
      sticker="hiccup"
      title="this page didn't load."
      action={
        <button type="button" className="claim-done system-action" onClick={reset}>
          try again <span aria-hidden="true">↻</span>
        </button>
      }
    >
      Your files and work are saved. Try again; if it keeps happening, it&apos;s on our side.
      {error.digest ? ` (Reference ${error.digest})` : ""}
    </SystemPage>
  )
}
