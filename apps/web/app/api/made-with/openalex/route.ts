import { NextResponse } from "next/server"
import { LibraryError } from "@/lib/library"
import { liveAllowed, searchExample } from "@/lib/made-with-live"

/** The OpenAlex page's live search (plan F61): the search deep search runs, for one topic. */
export async function GET(request: Request) {
  const topic = Number(new URL(request.url).searchParams.get("topic"))
  if (!Number.isInteger(topic)) return NextResponse.json({ error: "Pick a topic" }, { status: 400 })
  if (!liveAllowed(request, "openalex"))
    return NextResponse.json(
      { error: "That's a lot of searches. Try again in a minute." },
      { status: 429 },
    )
  try {
    return NextResponse.json({ works: await searchExample(topic) })
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[made-with] openalex", (error as Error).message)
    return NextResponse.json(
      { error: "OpenAlex didn't answer just now. Try again." },
      { status: 503 },
    )
  }
}
