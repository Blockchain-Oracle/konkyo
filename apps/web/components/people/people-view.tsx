"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import type { Counts, PeopleTab, Person } from "@/lib/people"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"
import { useMe } from "@/lib/use-me"
import { useQuery } from "@/lib/use-query"
import { FollowButton } from "./follow-button"
import { openKeep } from "./keep-dialog"
import { MemberFace } from "./member-face"

const TABS: { id: PeopleTab; label: string; empty: string }[] = [
  {
    id: "friends",
    label: "friends",
    empty: "No friends yet. When someone you follow follows you back, they show up here.",
  },
  {
    id: "following",
    label: "following",
    empty:
      "You're not following anyone yet. Find people with ⌘K, or follow someone from their page.",
  },
  {
    id: "followers",
    label: "followers",
    empty: "Nobody follows you yet. Share your page and they will.",
  },
]

export function PeopleView() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "friends") as PeopleTab
  const { me } = useMe()
  const { data, isPending, refetch } = useQuery({
    queryKey: qk.people.tab(tab),
    queryFn: () =>
      api<{ people: Person[]; counts: Counts }>(`/api/people?tab=${encodeURIComponent(tab)}`),
  })
  const counts = data?.counts
  const viewer = me?.isGuest ? "guest" : "kept"

  return (
    <div className="people-view">
      <nav className="me-tabs people-tabs" aria-label="Your people">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? "is-here" : undefined}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => {
              sound("tap")
              router.replace(`${pathname}?tab=${t.id}` as Route, { scroll: false })
            }}
          >
            {t.label}
            {counts && <small>{counts[t.id]}</small>}
          </button>
        ))}
      </nav>

      <ul className="people-list">
        <li>
          <InviteCard handle={me?.handle ?? null} guest={Boolean(me?.isGuest)} />
        </li>
        {isPending ? (
          <li className="people-empty" aria-busy>
            …
          </li>
        ) : data?.people.length ? (
          data.people.map((person) => (
            <li key={person.handle} className="person-row">
              <Link href={`/u/${person.handle}` as Route} className="person-who">
                <MemberFace face={person.face} size="lg" />
                <span>
                  <strong>{person.name}</strong>
                  <small>
                    @{person.handle}
                    {person.relation.followsYou && !person.relation.friends ? " · follows you" : ""}
                  </small>
                  {person.bio && <em>{person.bio}</em>}
                </span>
              </Link>
              <FollowButton
                handle={person.handle}
                relation={person.relation}
                viewer={viewer}
                confirm
                onChange={() => void refetch()}
              />
            </li>
          ))
        ) : (
          <li className="people-empty">{TABS.find((t) => t.id === tab)?.empty}</li>
        )}
      </ul>
    </div>
  )
}

/** Oku's invite card, first in the list: your page is the invitation. */
function InviteCard({ handle, guest }: { handle: string | null; guest: boolean }) {
  return (
    <div className="invite-card">
      <span className="invite-card-mark" aria-hidden="true">
        ☺︎
      </span>
      <div>
        <strong>invite a friend</strong>
        <p>konkyo is better with your study group: follow each other and you&apos;re friends.</p>
      </div>
      {handle ? (
        <button
          type="button"
          className="claim-done"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/u/${handle}`)
            sound("tap")
            toast.success("Link copied")
          }}
        >
          copy my page link
        </button>
      ) : guest ? (
        <button
          type="button"
          className="claim-done"
          onClick={() =>
            openKeep("friends find you by your page: keep this library, then share it.", "/people")
          }
        >
          keep my account first
        </button>
      ) : (
        <Link className="claim-done" href={"/settings#you" as Route}>
          claim my page first
        </Link>
      )}
    </div>
  )
}
