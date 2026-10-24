import { APP, SPACES, type SpaceWall } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { type CSSProperties, Suspense } from "react"
import { BrandMark } from "@/components/brand-mark"
import { FollowButton } from "@/components/people/follow-button"
import { MemberFace } from "@/components/people/member-face"
import { ShareProfile } from "@/components/people/share-profile"
import { articlesBy } from "@/lib/articles"
import { countsFor, relationTo } from "@/lib/people"
import { publicProfile } from "@/lib/profiles"
import { getSession } from "@/lib/session"

type Props = {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ tab?: string }>
}

// Static on purpose (a request-time generateMetadata blocks hydration with Cache Components, as
// on /s): the page sets its own <title>, which React hoists into the head.
export const metadata: Metadata = { title: "Profile" }

const MONTH = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" })
const DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" })
/** Reading speed for "N min read", as on the article itself. */
const WORDS_PER_MINUTE = 230

/** The wall behind a page is the person's own colour (their look's), as a space's is. */
function wallFor(color: string) {
  const entry = Object.entries(SPACES.colors).find(([, c]) => c.hex === color)
  const wall = entry
    ? (SPACES.defaultWall[entry[0] as keyof typeof SPACES.defaultWall] as SpaceWall)
    : "violet"
  return SPACES.walls[wall]
}

async function Profile({ params, searchParams }: Props) {
  const [{ handle }, { tab }] = await Promise.all([params, searchParams])
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
  const [counts, relation, written] = await Promise.all([
    countsFor(profile.userId),
    relationTo(session?.user.id ?? null, profile.userId),
    articlesBy(profile.userId),
  ])
  const viewer = !session ? "signed-out" : session.user.isAnonymous ? "guest" : "kept"
  const wall = wallFor(profile.face.color)
  const spaces = profile.spaces
  // Articles lead when there are any; a link can ask for either.
  const showing =
    tab === "spaces" || tab === "articles" ? tab : written.length ? "articles" : "spaces"
  const here = `/u/${profile.handle}`
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
            {isMine ? (
              <>
                <Link href={"/people?tab=followers" as Route}>
                  <b>{counts.followers}</b> follower{counts.followers === 1 ? "" : "s"}
                </Link>
                <Link href={"/people?tab=following" as Route}>
                  <b>{counts.following}</b> following
                </Link>
              </>
            ) : (
              <>
                <span>
                  <b>{counts.followers}</b> follower{counts.followers === 1 ? "" : "s"}
                </span>
                <span>
                  <b>{counts.following}</b> following
                </span>
              </>
            )}
            <span>joined {MONTH.format(new Date(profile.joinedAt)).toLowerCase()}</span>
          </p>
          {relation.followsYou && !relation.friends && (
            <span className="me-follows-you">follows you</span>
          )}
          <div className="me-actions">
            {isMine ? (
              <Link className="claim-done" href={"/settings#you" as Route}>
                edit
              </Link>
            ) : (
              <FollowButton handle={profile.handle} relation={relation} viewer={viewer} />
            )}
            <ShareProfile handle={profile.handle} name={profile.name} />
          </div>
        </section>

        <nav className="me-tabs" aria-label="On this page">
          <Link
            href={`${here}?tab=articles` as Route}
            aria-current={showing === "articles" ? "page" : undefined}
            scroll={false}
          >
            articles <small>{written.length}</small>
          </Link>
          <Link
            href={`${here}?tab=spaces` as Route}
            aria-current={showing === "spaces" ? "page" : undefined}
            scroll={false}
          >
            public spaces <small>{spaces.length}</small>
          </Link>
        </nav>

        {showing === "articles" ? (
          written.length === 0 ? (
            <p className="me-spaces-empty">
              {isMine
                ? "Nothing published yet. Write a note with citations, check it, and press Publish ↗ in the editor."
                : `${profile.name} hasn't published an article yet.`}
            </p>
          ) : (
            <div className="me-article-list">
              {written.map((a) => (
                <Link key={a.slug} className="me-article" href={`/a/${a.slug}` as Route}>
                  {a.coverKey && (
                    // biome-ignore lint/performance/noImgElement: same-origin cover webp
                    <img src={`/api/a/${a.slug}/cover?v=${a.version}`} alt="" loading="lazy" />
                  )}
                  <span className="me-article-body">
                    <strong>{a.title}</strong>
                    {a.summary && <p>{a.summary}</p>}
                    <small>
                      {DAY.format(a.publishedAt).toLowerCase()} ·{" "}
                      {Math.max(1, Math.round(a.words / WORDS_PER_MINUTE))} min read
                      {a.check?.total ? (
                        <b>
                          ✓ {a.check.supported} of {a.check.total} claims supported
                        </b>
                      ) : null}
                    </small>
                  </span>
                </Link>
              ))}
            </div>
          )
        ) : spaces.length === 0 ? (
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
 * Someone's page (plan F54, Literal's profile): their face, name, @handle and bio, the articles
 * they published and the spaces they chose to list. Open to anyone, signed in or not.
 */
export default function ProfilePage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="me-page" aria-busy style={{ background: SPACES.walls.violet.bg }} />
      }
    >
      <Profile params={params} searchParams={searchParams} />
    </Suspense>
  )
}
