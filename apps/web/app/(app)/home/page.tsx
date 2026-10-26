import type { Metadata } from "next"
import { Suspense } from "react"
import { getSession } from "@/lib/session"
import { isFirstRun } from "@/lib/settings"
import { HomeRoom } from "./home-room"
import { HomeStart } from "./home-start"

export const metadata: Metadata = { title: "Home" }

/** Who is asking is request data: read inside the boundary, so the first HTML is the right Home. */
async function Home() {
  const session = await getSession()
  const firstRun = session ? await isFirstRun(session.user.id) : false
  return (
    <HomeStart firstRun={firstRun}>
      <HomeRoom />
    </HomeStart>
  )
}

/** Home is a room: the ask sheet leads, then the board of what's yours (plan F40, §16 S14). */
export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}
