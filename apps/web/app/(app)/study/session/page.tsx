import type { Metadata } from "next"
import { Suspense } from "react"
import { SessionFromParams } from "./session-from-params"

export const metadata: Metadata = { title: "Practice" }

/** A round: a quiz, today's review, or a game (plan F28–F30). Focused: one column, no page title. */
export default function SessionPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6">
      <Suspense>
        <SessionFromParams />
      </Suspense>
    </div>
  )
}
