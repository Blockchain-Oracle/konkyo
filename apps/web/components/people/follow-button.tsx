"use client"

import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import type { Counts, Relation } from "@/lib/people"
import { sound } from "@/lib/sounds"
import { openKeep } from "./keep-dialog"

export type { Counts, Relation }

/**
 * Follow (F55; Threads' states on a black sticker pill, one width for every state so rows never
 * jump): follow → following (cream, black outline; hover says unfollow) → friends when it's
 * mutual. In a list, unfollowing asks first. Signed out it leads to the door; a guest is told
 * following needs a kept account, with the way to keep it.
 */
export function FollowButton({
  handle,
  relation: initial,
  viewer,
  confirm = false,
  onChange,
}: {
  handle: string
  relation: Relation
  viewer: "signed-out" | "guest" | "kept"
  /** Ask before unfollowing (lists). */
  confirm?: boolean
  onChange?: (result: { relation: Relation; counts: Counts }) => void
}) {
  const router = useRouter()
  const [relation, setRelation] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  if (relation.you) return null
  if (viewer === "signed-out")
    return (
      <Link className="follow-button" href={`/sign-in?next=/u/${handle}` as Route}>
        follow
      </Link>
    )

  const go = async (method: "POST" | "DELETE") => {
    if (viewer === "guest") {
      toast("Following needs a kept account", {
        description: "Keep yours with an email code or Google: your library and look come along.",
        action: {
          label: "keep it",
          onClick: () =>
            openKeep("following carries your name: keep this library first.", `/u/${handle}`),
        },
      })
      return
    }
    setBusy(true)
    setAsking(false)
    // shown at once; the server's answer settles it
    setRelation((r) => {
      const following = method === "POST"
      return { ...r, following, friends: following && r.followsYou }
    })
    try {
      const result = await api<{ relation: Relation; counts: Counts }>(
        `/api/people/${handle}/follow`,
        { method },
      )
      setRelation(result.relation)
      // a list refetches itself; a profile page re-reads its counts from the server
      if (onChange) onChange(result)
      else router.refresh()
      sound(method === "POST" ? "place" : "tap")
    } catch (error) {
      setRelation(initial)
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (asking)
    return (
      <span className="follow-confirm" aria-live="polite">
        <span>unfollow @{handle}?</span>
        <button type="button" onClick={() => setAsking(false)}>
          cancel
        </button>
        <button type="button" className="is-danger" onClick={() => void go("DELETE")}>
          unfollow
        </button>
      </span>
    )

  if (!relation.following)
    return (
      <button
        type="button"
        className="follow-button"
        disabled={busy}
        onClick={() => void go("POST")}
      >
        {relation.followsYou ? "follow back" : "follow"}
      </button>
    )

  return (
    <button
      type="button"
      className="follow-button is-following"
      disabled={busy}
      onClick={() => (confirm ? setAsking(true) : void go("DELETE"))}
      aria-label={`Unfollow @${handle}`}
    >
      <span className="follow-now">{relation.friends ? "friends" : "following"}</span>
      <span className="follow-hover">unfollow</span>
    </button>
  )
}
