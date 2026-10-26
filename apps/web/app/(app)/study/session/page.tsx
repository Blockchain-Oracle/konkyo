import type { Metadata } from "next"
import { Suspense } from "react"
import { SessionFromParams } from "./session-from-params"

export const metadata: Metadata = { title: "Practice" }

/** A round: a quiz, today's review, or a game. Focused: one column, no page title. */
export default function SessionPage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 pt-4 pb-28 md:px-8 md:pt-[92px]">
      <Suspense>
        <SessionFromParams />
      </Suspense>
    </div>
  )
}
