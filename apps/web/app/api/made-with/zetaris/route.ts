import { NextResponse } from "next/server"
import { LibraryError } from "@/lib/library"
import { checkExample, liveAllowed } from "@/lib/made-with-live"

/** The Zetaris page's live check (plan F61): three quotes, one statement, the real engine. */
export async function POST(request: Request) {
  if (!liveAllowed(request, "zetaris"))
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
