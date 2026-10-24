import { APP, SPACES, type SpaceWall } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { type CSSProperties, Suspense } from "react"
import { BrandMark } from "@/components/brand-mark"
import { MemberFace } from "@/components/people/member-face"
import { ShareProfile } from "@/components/people/share-profile"
import { publicProfile } from "@/lib/profiles"
import { getSession } from "@/lib/session"

type Props = { params: Promise<{ handle: string }> }

// Static on purpose (a request-time generateMetadata blocks hydration with Cache Components, as
// on /s): the page sets its own <title>, which React hoists into the head.
export const metadata: Metadata = { title: "Profile" }

const MONTH = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" })

/** The wall behind a page is the person's own colour (their look's), as a space's is. */
function wallFor(color: string) {
  const entry = Object.entries(SPACES.colors).find(([, c]) => c.hex === color)
  const wall = entry
    ? (SPACES.defaultWall[entry[0] as keyof typeof SPACES.defaultWall] as SpaceWall)
    : "violet"
  return SPACES.walls[wall]
}

async function Profile({ params }: Props) {
  const { handle } = await params
  const [profile, session] = await Promise.all([publicProfile(handle), getSession()])
  if (!profile)
    return (
      <main
        className="me-page grid place-items-center"
        style={{ background: SPACES.walls.violet.bg }}
      >
        <title>{`No one here · ${APP.name}`}</title>
        <div className="me-card" style={{ rotate: "0deg" }}>
          <BrandMark className="size-10" />
          <h1 className="me-name">nobody&apos;s here</h1>
          <p className="me-bio">
            @{handle} isn&apos;t anyone&apos;s page. It may have changed, or never existed.
          </p>
          <Link className="claim-done" href="/">
            what is konkyo? <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>
    )
  const isMine = session?.user.id === profile.userId
  const wall = wallFor(profile.face.color)
  const spaces = profile.spaces
  return (
    <main
      className="me-page"
      style={{ background: wall.bg, "--look": profile.face.color } as CSSProperties}
    >
      <title>{`${profile.name} (@${profile.handle}) · ${APP.name}`}</title>
      <meta name="description" content={profile.bio ?? `${profile.name} on ${APP.name}`} />
      <Link className="me-back" href={(session ? "/home" : "/") as Route}>
        <BrandMark small className="size-4" />
        {session ? "back to konkyo" : "konkyo"}
      </Link>
      <div className="me-wrap">
        <section className="me-card" aria-label={`${profile.name}'s page`}>
          <span className="me-handle">@{profile.handle}</span>
          <span className="me-face">
            <MemberFace face={profile.face} size="lg" />
          </span>
          <h1 className="me-name">{profile.name}</h1>
          {profile.bio && <p className="me-bio">{profile.bio}</p>}
          <p className="me-meta">
            <span>
              {spaces.length} public space{spaces.length === 1 ? "" : "s"}
            </span>
            <span>joined {MONTH.format(new Date(profile.joinedAt)).toLowerCase()}</span>
          </p>
          <div className="me-actions">
            {isMine && (
              <Link className="claim-done" href={"/settings#you" as Route}>
                edit
              </Link>
            )}
            <ShareProfile handle={profile.handle} name={profile.name} />
          </div>
        </section>

        <nav className="me-tabs" aria-label="On this page">
          <span>
            public spaces <small>{spaces.length}</small>
          </span>
        </nav>

        {spaces.length === 0 ? (
          <p className="me-spaces-empty">
            {isMine
              ? "Nothing listed yet. Share a space and switch on “show on my page” in its share box, and it shows here."
              : `${profile.name} hasn't listed a public space yet.`}
          </p>
        ) : (
          <div className="me-space-grid">
            {spaces.map((space) => (
              <a
                key={space.href}
                className="me-space"
                href={space.href}
                style={
                  {
                    "--space": space.color,
                    "--space-ink": readableInk(space.color),
                  } as CSSProperties
                }
              >
                <span className="me-space-icon" aria-hidden="true">
                  {space.symbol ?? "✦"}
                </span>
                <strong>{space.name}</strong>
                {space.about && <p>{space.about}</p>}
                <small>
                  {space.sources} source{space.sources === 1 ? "" : "s"}
                </small>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

/**
 * Someone's page (plan F54, Literal's profile): their face, name, @handle and bio, and the
 * spaces they chose to list. Open to anyone, signed in or not.
 */
export default function ProfilePage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <main className="me-page" aria-busy style={{ background: SPACES.walls.violet.bg }} />
      }
    >
      <Profile params={params} />
    </Suspense>
  )
}
