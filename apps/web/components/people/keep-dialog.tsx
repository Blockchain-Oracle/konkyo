"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useSyncExternalStore } from "react"
import { authClient } from "@/lib/auth-client"
import { JoinForm } from "./join-form"

/**
 * Keep this account, from anywhere in the app: the enter card's join form (a six-digit code by
 * email, or Google) over the page, so a guest who reaches something only kept accounts can do
 * (publish, invite friends, connectors, API keys) keeps their library and carries on where they
 * were. Without email on this server it goes straight to Google.
 */
type Ask = { reason: string; then?: string }

let current: Ask | null = null
const listeners = new Set<() => void>()
const set = (next: Ask | null) => {
  current = next
  for (const l of listeners) l()
}

export const openKeep = (reason: string, then?: string) => set({ reason, then })

const google = (then: string) =>
  void authClient.signIn.social({ provider: "google", callbackURL: then, errorCallbackURL: then })

export function KeepDialog({ email }: { email: boolean }) {
  const router = useRouter()
  const ask = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => null,
  )
  const then = ask?.then ?? (typeof window === "undefined" ? "/home" : window.location.pathname)

  useEffect(() => {
    if (!ask) return
    if (!email) {
      set(null)
      google(then)
      return
    }
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && set(null)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ask, email, then])

  if (!ask || !email) return null
  return (
    <>
      <button
        type="button"
        className="entry-gate-scrim"
        aria-label="Close"
        onClick={() => set(null)}
      />
      <section
        className="claim-card is-gate"
        role="dialog"
        aria-modal
        aria-label="Keep this library"
      >
        <JoinForm
          title="keep this"
          reason={ask.reason}
          google={() => google(then)}
          onJoined={() => {
            set(null)
            router.replace(then as Route)
            router.refresh()
          }}
          onCancel={() => set(null)}
        />
      </section>
    </>
  )
}
