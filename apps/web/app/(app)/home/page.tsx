import type { Metadata } from "next"
import { HomeRoom } from "./home-room"
import { HomeStart } from "./home-start"

export const metadata: Metadata = { title: "Home" }

/** Home is a room: the ask sheet leads, then the board of what's yours (plan F40, §16 S14). */
export default function HomePage() {
  return (
    <HomeStart>
      <HomeRoom />
    </HomeStart>
  )
}
