import { randomInt } from "node:crypto"
import { LOOKS } from "@konkyo/config"
import { spaceRole } from "@konkyo/db/access"
import { emailReady } from "@konkyo/email"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { type CSSProperties, Suspense } from "react"
import { EnterCard } from "@/components/people/enter-card"
import { JoinCard } from "@/components/people/join-card"
import { LibraryError } from "@/lib/library"
import { type InvitePreview, invitePreview } from "@/lib/members"
import { getMe } from "@/lib/profiles"
import { getSession } from "@/lib/session"

// An invite is a private link: kept out of search results, static on purpose (see /s).
export const metadata: Metadata = {
  title: "You're invited",
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

async function preview(token: string): Promise<InvitePreview | null> {
  try {
    return await invitePreview(token)
  } catch (error) {
    if (error instanceof LibraryError && error.status === 404) return null
    throw error
  }
}

/** Behind the card: the space's own wall with its name, as you'd see it inside. */
function Wall({ space }: { space: InvitePreview | null }) {
  const wall = space?.wall ?? { bg: "#b7a7ff", ink: "#1b1532" }
  return (
    <div
      className="gate-room"
      style={{ "--wall": wall.bg, "--wall-ink": wall.ink } as CSSProperties}
      aria-hidden="true"
    >
      {space && <h2 className="gate-room-title">{space.name.toLowerCase()}</h2>}
    </div>
  )
}

async function Door({ params }: Props) {
  await connection()
  const { token } = await params
  const [space, session] = await Promise.all([preview(token), getSession()])
  if (!space)
    return (
      <>
        <Wall space={null} />
        <div className="entry-gate-scrim" aria-hidden="true" />
        <div className="claim-card is-gate">
          <span className="claim-card-kicker">this invite</span>
          <strong className="font-display text-[26px] leading-none font-extrabold">
            isn&apos;t open any more
          </strong>
          <p className="claim-gate-note">
            the link was reset or the space was deleted. ask whoever sent it for a new one.
          </p>
          <Link className="claim-done" href="/">
            what is konkyo? <span aria-hidden="true">→</span>
          </Link>
        </div>
      </>
    )
  // already in: straight to the space
  if (session && (await spaceRole(session.user.id, space.spaceId)))
    redirect(`/spaces/${space.spaceId}` as Route)
  const faces = [space.owner.face, ...space.members]
  return (
    <>
      <Wall space={space} />
      <div className="entry-gate-scrim" aria-hidden="true" />
      {session ? (
        <JoinCard token={token} space={space} me={await getMe(session.user.id)} />
      ) : (
        <EnterCard
          next={`/join/${token}`}
          firstLook={LOOKS[randomInt(LOOKS.length)]?.id ?? LOOKS[0].id}
          here={{ count: 0, looks: [] }}
          email={emailReady()}
          room={{
            token,
            name: space.name,
            color: space.color,
            ownerName: space.owner.name,
            faces,
            count: space.count,
          }}
        />
      )}
    </>
  )
}

/** An invite into a space: the enter card for that space. */
export default function JoinPage(props: Props) {
  return (
    <main className="gate-page">
      <h1 className="sr-only">Join a space on Konkyo</h1>
      <Suspense fallback={<div className="gate-room" aria-hidden="true" />}>
        <Door {...props} />
      </Suspense>
    </main>
  )
}
