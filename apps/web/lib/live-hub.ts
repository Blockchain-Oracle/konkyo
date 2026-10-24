import "server-only"
import { pg } from "@konkyo/db"
import { mySpaces } from "@konkyo/db/access"
import { LIVE_CHANNEL, type LiveMessage } from "@konkyo/db/live"
import type { Face } from "./profiles"

/*
 * The live hub (plan §16.9, S19): one LISTEN on the `live` channel for the whole web process, fanned
 * out to every open tab's stream (`/api/live`). A tab hears only about spaces it's in, and only ids:
 * it refetches through the routes that check access. Who's here now is kept right here, in memory:
 * the web app runs as one process, so every tab's connection passes through this hub.
 */

export type Present = { userId: string; face: Face }

type Sub = {
  id: string
  userId: string
  face: Face
  spaces: Set<string>
  /** The space this tab is looking at (presence), or null. */
  here: string | null
  send: (event: string, data: unknown, id?: number) => void
}

type Hub = { subs: Map<string, Sub>; listening: Promise<unknown> | null }
const g = globalThis as typeof globalThis & { __konkyoLive?: Hub }
g.__konkyoLive ??= { subs: new Map(), listening: null }
const hub = g.__konkyoLive

function listen() {
  hub.listening ??= pg
    .listen(LIVE_CHANNEL, (payload) => {
      let message: LiveMessage
      try {
        message = JSON.parse(payload) as LiveMessage
      } catch {
        return
      }
      if (message.type === "event") {
        for (const sub of hub.subs.values())
          if (sub.spaces.has(message.spaceId)) sub.send("space", message, message.id)
        // someone joined: their own tabs learn the space at once (others already have it)
        if (message.kind === "member_joined") void refreshSpaces()
        return
      }
      const space = message.topic.startsWith("space:") ? message.topic.slice(6) : null
      for (const sub of hub.subs.values())
        if (!space || sub.spaces.has(space)) sub.send("signal", message)
    })
    .catch((error) => {
      hub.listening = null
      console.error("[live] listen", error)
    })
  return hub.listening
}

/** Spaces can change under an open tab (a join, a removal): re-read them for everyone. */
async function refreshSpaces() {
  const users = new Map<string, Sub[]>()
  for (const sub of hub.subs.values())
    users.set(sub.userId, [...(users.get(sub.userId) ?? []), sub])
  for (const [userId, subs] of users) {
    const spaces = new Set((await mySpaces(userId)).map((s) => s.spaceId))
    for (const sub of subs) sub.spaces = spaces
  }
}

/** Everyone looking at a space right now (one entry per person, however many tabs). */
export function presentIn(spaceId: string): Present[] {
  const people = new Map<string, Present>()
  for (const sub of hub.subs.values())
    if (sub.here === spaceId && sub.spaces.has(spaceId))
      people.set(sub.userId, { userId: sub.userId, face: sub.face })
  return [...people.values()]
}

function announcePresence(spaceId: string) {
  const people = presentIn(spaceId)
  for (const sub of hub.subs.values())
    if (sub.spaces.has(spaceId)) sub.send("presence", { spaceId, people })
}

/** A tab's stream opened: it hears its spaces, and counts as here in the one it's looking at. */
export async function join(sub: Omit<Sub, "spaces">): Promise<Set<string>> {
  await listen()
  const spaces = new Set((await mySpaces(sub.userId)).map((s) => s.spaceId))
  const here = sub.here && spaces.has(sub.here) ? sub.here : null
  hub.subs.set(sub.id, { ...sub, here, spaces })
  if (here) announcePresence(here)
  // what everyone is doing in my spaces right now, so a fresh tab starts with the faces
  for (const spaceId of spaces) sub.send("presence", { spaceId, people: presentIn(spaceId) })
  return spaces
}

export function leave(id: string) {
  const sub = hub.subs.get(id)
  if (!sub) return
  hub.subs.delete(id)
  if (sub.here) announcePresence(sub.here)
}
