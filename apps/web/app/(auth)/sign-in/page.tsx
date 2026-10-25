import { randomInt } from "node:crypto"
import { LOOKS, ROUTES, SPACES, type SpaceWall } from "@konkyo/config"
import { emailReady } from "@konkyo/email"
import { env } from "@konkyo/env/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { type CSSProperties, Suspense } from "react"
import { EnterCard } from "@/components/people/enter-card"
import { LibraryError } from "@/lib/library"
import { hereNow } from "@/lib/profiles"
import { getSession } from "@/lib/session"
import { openShare } from "@/lib/shares"

export const metadata: Metadata = { title: "Enter" }

/**
 * Only same-site paths are honoured, so `?next=` can never send someone to another site (a
 * browser reads `/\\evil.com` as `//evil.com`, so backslashes are refused too).
 */
function safeNext(value: string | string[] | undefined): string {
  const next = typeof value === "string" ? value : undefined
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) return ROUTES.home
  const base = "https://konkyo.invalid"
  return new URL(next, base).origin === base ? next : ROUTES.home
}

/** Signed in already → on to where you were going; else the door, with a look picked for you. */
async function Door({ searchParams }: PageProps<"/sign-in">) {
  await connection()
  const [session, params] = await Promise.all([getSession(), searchParams])
  if (session) redirect(safeNext(params.next) as never)
  const here = await hereNow()
  const firstLook = LOOKS[randomInt(LOOKS.length)]?.id ?? LOOKS[0].id
  return (
    <EnterCard
      next={safeNext(params.next)}
      firstLook={firstLook}
      here={here}
      email={emailReady()}
    />
  )
}

/** Where the polaroids hang on the wall behind the card (OurSpaces' board, loosely). */
const SPOTS = [
  { left: "6%", top: "16%", tilt: -4 },
  { left: "24%", top: "52%", tilt: 3 },
  { left: "70%", top: "12%", tilt: 5 },
  { left: "78%", top: "54%", tilt: -3 },
  { left: "44%", top: "70%", tilt: -2 },
  { left: "46%", top: "6%", tilt: 2 },
]

/**
 * The public sample space, blurred behind the door (plan F53): its real name, colour and first
 * pages. A server without a sample space shows the bare wall.
 */
async function SampleSpace() {
  await connection()
  const slug = env.DEMO_SHARE_SLUG
  const share = slug
    ? await openShare(slug).catch((error) => {
        if (error instanceof LibraryError) return null
        throw error
      })
    : null
  const wall = SPACES.walls[(share?.wall as SpaceWall | null) ?? "violet"] ?? SPACES.walls.violet
  const pages = share?.files.slice(0, SPOTS.length) ?? []
  return (
    <div
      className="gate-room"
      style={{ "--wall": wall.bg, "--wall-ink": wall.ink } as CSSProperties}
      aria-hidden="true"
    >
      {share && <h2 className="gate-room-title">{share.name.toLowerCase()}</h2>}
      {pages.map((file, i) => {
        const spot = SPOTS[i % SPOTS.length] as (typeof SPOTS)[number]
        return (
          <figure
            key={file.id}
            className="board-polaroid gate-room-photo"
            style={{ left: spot.left, top: spot.top, rotate: `${spot.tilt}deg` }}
          >
            <span className="photo-tape photo-tape-left" />
            {file.thumbUrl ? (
              // biome-ignore lint/performance/noImgElement: a page-one polaroid from our own origin
              <img src={file.thumbUrl} alt="" width={200} height={220} />
            ) : (
              <span className="polaroid-blank">{file.title.slice(0, 1)}</span>
            )}
            <figcaption>
              <strong>{file.title}</strong>
              {file.byline && <span>{file.byline}</span>}
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}

/**
 * Enter Konkyo (plan F53): OurSpaces' door over the blurred sample space. A name and a look in
 * two taps; keeping it on other devices is one quiet line under the way in.
 */
export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <main className="gate-page">
      <Suspense fallback={<div className="gate-room" aria-hidden="true" />}>
        <SampleSpace />
      </Suspense>
      <div className="entry-gate-scrim" aria-hidden="true" />
      <h1 className="sr-only">Enter Konkyo</h1>
      <Suspense fallback={null}>
        <Door {...props} />
      </Suspense>
    </main>
  )
}
