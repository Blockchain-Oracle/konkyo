"use client"

import type { SpaceEventKind } from "@konkyo/db/schema"
import { type QueryKey, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import type { Present } from "@/lib/live-hub"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"
import { useMe } from "@/lib/use-me"
import { useCurrentSpaceId } from "./rail"

/*
 * Live: one stream per tab. Events name what changed in a space; the queries that
 * show it refetch, a burst coalesced into one refetch per query. Presence says who's looking at a
 * space now; someone new walking in gets a toast.
 */

/** Round signals arrive in bursts (answers); one refetch per burst, quickly. */
const ROUND_COALESCE_MS = 120

type SpaceMessage = {
  spaceId: string
  id: number
  kind: SpaceEventKind
  subjectId: string | null
  actorId: string | null
}

let present: Record<string, Present[]> = {}
const listeners = new Set<() => void>()
const setPresent = (spaceId: string, people: Present[]) => {
  present = { ...present, [spaceId]: people }
  for (const l of listeners) l()
}

/** Who's looking at a space right now (you included). */
export function usePresence(spaceId: string | null | undefined): Present[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (spaceId ? (present[spaceId] ?? NONE) : NONE),
    () => NONE,
  )
}
const NONE: Present[] = []

/** What each kind of event makes stale. */
function staleFor(event: SpaceMessage): QueryKey[] {
  switch (event.kind) {
    case "source_added":
    case "source_ready":
    case "source_failed":
    case "source_removed":
    case "mail_arrived":
      return [qk.files.all, qk.spaces.all, ["catchup"], ["folders"]]
    case "pin_added":
    case "pin_removed":
      // a pin from the space chat marks its message too
      return [qk.spaces.pins(event.spaceId), ["space-messages", event.spaceId], ["catchup"]]
    case "member_joined":
    case "role_changed":
      return [qk.spaces.members(event.spaceId), qk.spaces.list()]
    // someone leaving (or taken out) may take their sources with them
    case "member_left":
    case "member_removed":
      return [qk.spaces.members(event.spaceId), qk.spaces.all, qk.files.all, ["catchup"]]
    case "space_updated":
    case "space_trashed":
    case "space_restored":
      return [qk.spaces.all, ["folders"]]
    case "take_added":
    case "take_removed":
      return [["takes", event.spaceId]]
    case "round_started":
    case "round_ended":
      return [["space-round", event.spaceId], ["catchup"]]
    case "message_added":
    case "message_updated":
    case "message_removed":
      return [["space-messages", event.spaceId]]
    default:
      return [["catchup"]]
  }
}

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const here = useCurrentSpaceId()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me } = useMe()
  const meId = me?.id
  const last = useRef(0)
  const stale = useRef(new Map<string, QueryKey>())
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seen = useRef<Record<string, Set<string>>>({})
  const where = useRef(pathname)
  where.current = pathname

  useEffect(() => {
    if (!meId) return
    // the space you just walked into: its first snapshot says who's there, not who arrived
    if (here) delete seen.current[here]
    const source = new EventSource(
      `/api/live${here ? `?here=${here}` : ""}${last.current ? `${here ? "&" : "?"}after=${last.current}` : ""}`,
    )
    const refresh = () => {
      flush.current = null
      for (const key of stale.current.values())
        void queryClient.invalidateQueries({ queryKey: key })
      stale.current.clear()
    }
    source.addEventListener("space", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as SpaceMessage
      last.current = Math.max(last.current, event.id)
      for (const key of staleFor(event)) stale.current.set(JSON.stringify(key), key)
      flush.current ??= setTimeout(refresh, 300)
      // what happened to me
      if (event.subjectId === meId && event.kind === "member_removed") {
        toast("You were taken out of a space")
        if (where.current.includes(event.spaceId)) router.push("/home" as Route)
      }
      if (event.subjectId === meId && event.kind === "role_changed")
        toast("Your role in a space changed")
      // mail to the space you're in (F59): the envelope arrives, with what becomes of it (events
      // carry ids only: an actor means its sender could add, so its sources are on their way)
      if (event.kind === "mail_arrived" && where.current.includes(event.spaceId)) {
        sound("place")
        toast("✉ Mail just arrived in this space", {
          description: event.actorId
            ? "Its papers are landing on the wall and being read."
            : "It's from someone outside the space: it waits for the owner's yes.",
        })
      }
      // someone started a live round in one of your spaces: a seat is one tap away
      if (event.kind === "round_started" && event.actorId !== meId) {
        sound("place")
        toast("A live round just started in one of your spaces", {
          action: {
            label: "join",
            // the round this event named, not whichever is newest
            onClick: () =>
              void api<{ round: { code: string } | null }>(
                `/api/spaces/${event.spaceId}/round?round=${event.subjectId ?? ""}`,
              )
                .then(({ round }) =>
                  round
                    ? router.push(`/study/live/${round.code}` as Route)
                    : toast("That round has already finished"),
                )
                .catch(() => toast("That round isn't open to you any more")),
          },
        })
      }
    })
    // Konkyo's answer in a space chat moved a step: its thread refetches
    source.addEventListener("signal", (e) => {
      const signal = JSON.parse((e as MessageEvent).data) as { topic: string; kind: string }
      // a live round moved (a phase, a player, an answer): its players refetch, a burst at once
      if (signal.topic.startsWith("round:")) {
        const key = ["round", signal.topic.slice(6)]
        stale.current.set(JSON.stringify(key), key)
        flush.current ??= setTimeout(refresh, ROUND_COALESCE_MS)
        return
      }
      if (signal.kind === "answer_progress" && signal.topic.startsWith("space:")) {
        const key = ["space-messages", signal.topic.slice(6)]
        stale.current.set(JSON.stringify(key), key)
        flush.current ??= setTimeout(refresh, 300)
      }
    })
    source.addEventListener("presence", (e) => {
      const { spaceId, people } = JSON.parse((e as MessageEvent).data) as {
        spaceId: string
        people: Present[]
      }
      const before = seen.current[spaceId]
      const now = new Set(people.map((p) => p.userId))
      // someone walked into the space you're in (not the first snapshot, not you)
      if (before && spaceId === here)
        for (const p of people)
          if (!before.has(p.userId) && p.userId !== meId) {
            sound("place")
            toast(`${p.face.name} just walked in`)
          }
      seen.current[spaceId] = now
      setPresent(spaceId, people)
    })
    return () => {
      source.close()
      if (flush.current) clearTimeout(flush.current)
      flush.current = null
    }
  }, [here, meId, queryClient, router])

  return children
}
