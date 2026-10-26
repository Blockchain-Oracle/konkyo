import { NextResponse } from "next/server"
import { LibraryError } from "@/lib/library"
import { checkExample, freshCheck, liveAllowed } from "@/lib/made-with-live"

/**
 * The Zetaris page's live check: three quotes, one statement, the real engine. A
 * check made in the last half minute is shown again (with when it ran) without touching Zetaris.
 */
export async function POST(request: Request) {
  if (!freshCheck() && !liveAllowed(request, "zetaris"))
    return NextResponse.json(
      { error: "That's a lot of checks. Try again in a minute." },
      { status: 429 },
    )
  try {
    return NextResponse.json(await checkExample())
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[made-with] zetaris", (error as Error).message)
    return NextResponse.json(
      { error: "Zetaris didn't answer just now. Try again." },
      { status: 503 },
    )
  }
}
