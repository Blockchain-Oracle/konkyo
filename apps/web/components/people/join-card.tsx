"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { api } from "@/lib/fetcher"
import type { InvitePreview } from "@/lib/members"
import type { Me } from "@/lib/profiles"
import { sound } from "@/lib/sounds"
import { MemberFace } from "./member-face"

/**
 * Joining as who you already are: the space, who's in,
 * your face and name as they'll see you, one lime "join".
 */
export function JoinCard({ token, space, me }: { token: string; space: InvitePreview; me: Me }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const faces = [space.owner.face, ...space.members]
  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const { spaceId } = await api<{ spaceId: string }>(`/api/join/${token}`, { method: "POST" })
      sound("place")
      router.replace(`/spaces/${spaceId}` as Route)
      router.refresh()
    } catch (failed) {
      setBusy(false)
      setError((failed as Error).message)
    }
  }
  return (
    <section className="claim-card is-gate" aria-label={`Join ${space.name}`}>
      <div className="claim-room">
        <span className="claim-card-kicker">you&apos;re invited into</span>
        <div className="claim-room-name">
          <span
            className="claim-room-color"
            style={{ backgroundColor: space.color }}
            aria-hidden="true"
          />
          <strong>{space.name.toLowerCase()}</strong>
        </div>
        <div className="claim-room-here">
          <div className="claim-room-faces" aria-hidden="true">
            {faces.slice(0, 5).map((face, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: faces can repeat a look
              <MemberFace key={`${face.name}-${i}`} face={face} size="sm" />
            ))}
          </div>
          <span>
            <i aria-hidden="true" />
            {space.count} in {space.owner.name.toLowerCase()}&apos;s space
          </span>
        </div>
      </div>
      <p className="claim-gate-note">
        {space.role === "add"
          ? "you'll read everything in it, ask it, and add your own sources."
          : "you'll read everything in it and ask it."}
      </p>
      <div className="claim-return">
        <span className="claim-return-face" style={{ ["--look" as string]: me.face.color }}>
          <MemberFace face={me.face} size="lg" />
        </span>
        <div className="claim-return-copy">
          <span className="claim-picker-label">they&apos;ll see you as</span>
          <strong className="font-display text-[22px] leading-none font-extrabold">
            {me.name}
          </strong>
        </div>
      </div>
      {error && (
        <span className="join-form-error" role="alert">
          {error}
        </span>
      )}
      <button type="button" className="claim-done" disabled={busy} onClick={() => void join()}>
        {busy ? "walking in…" : `join ${space.name.toLowerCase()} →`}
      </button>
    </section>
  )
}
