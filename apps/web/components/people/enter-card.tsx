"use client"

/*
 * Ported from OurSpaces (https://github.com/thomasnguyen/ourspaces-app, src/components/ClaimCard.tsx,
 * the "gate" variant), MIT licence, Copyright (c) 2026 Thomas Nguyen. Their door into a live room
 * is Konkyo's door into your library: the room is named at the top with who's in, a look is one
 * tap, Enter walks you in as a guest, and keeping it is one quiet line under the way in. Their
 * email code arrives with S24; until then "keep this" and "sign in" are Google.
 */

import { LOOKS, type LookId, PEOPLE, SPACES } from "@konkyo/config"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react"
import { authClient } from "@/lib/auth-client"
import { sound } from "@/lib/sounds"
import { saveProfile, uploadPhoto } from "@/lib/use-me"
import { LookRow } from "./look-row"
import { MemberFace } from "./member-face"
import { PhotoInput } from "./photo-input"

const GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)"
const COLLAPSE_MS = 440

type Pending = "enter" | "keep" | "signin" | null

export function EnterCard({
  next,
  firstLook,
  here,
}: {
  /** Where you were going (`?next=`), already checked to be one of ours. */
  next: string
  /** The look (and its name) you arrive with, picked at random on the server. */
  firstLook: LookId
  here: { count: number; looks: LookId[] }
}) {
  const router = useRouter()
  const start = LOOKS.find((look) => look.id === firstLook) ?? LOOKS[0]
  const [name, setName] = useState<string>(start.name)
  const [lookId, setLookId] = useState<LookId>(start.id)
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [usePhoto, setUsePhoto] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const cardRef = useRef<HTMLFormElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  /* Desktop lands with the name selected: one keystroke replaces "juno", Enter walks in. Phones
     keep the keyboard down until you ask for it. */
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    const timer = window.setTimeout(() => {
      nameRef.current?.focus({ preventScroll: true })
      nameRef.current?.select()
    }, 260)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo])

  const look = LOOKS.find((l) => l.id === lookId) ?? start
  const lookColor = SPACES.colors[look.color].hex
  const typed = !LOOKS.some((l) => l.name === name.trim())

  const pickLook = (picked: (typeof LOOKS)[number]) => {
    setLookId(picked.id)
    setUsePhoto(false)
    // a look's name is a placeholder the next look replaces; a name you typed is yours
    if (!typed || !name.trim()) setName(picked.name)
    sound("tap")
  }

  /* The guest session, then who you are in it. A photo waits in the page until there's a person
     to own it. */
  const becomeGuest = async () => {
    const { error: failed } = await authClient.signIn.anonymous()
    if (failed) throw new Error("Couldn't open the door just now. Try again.")
    await saveProfile({ name: name.trim() || start.name, lookId })
    if (photo && usePhoto) await uploadPhoto(photo.blob)
  }

  /* The card travels to the orb's seat and shrinks into it, so the next thing you see is the
     orb with its coach slip (OurSpaces collapses it into your cursor). */
  const collapse = () => {
    const card = cardRef.current
    if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const rect = card.getBoundingClientRect()
    const dx = window.innerWidth / 2 - (rect.left + rect.width / 2)
    const dy = window.innerHeight - 52 - (rect.top + rect.height / 2)
    card.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        { opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0 },
      ],
      { duration: COLLAPSE_MS, easing: GLIDE, fill: "forwards" },
    )
  }

  const enter = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPending("enter")
    setError(null)
    try {
      await becomeGuest()
      sound("place")
      setLeaving(true)
      collapse()
      window.setTimeout(() => {
        router.replace(next as Route)
        router.refresh()
      }, COLLAPSE_MS - 80)
    } catch (failed) {
      setPending(null)
      setError((failed as Error).message)
    }
  }

  /* Keep this: walk in as a guest with this name and look, then link Google. Linking moves
     everything the guest has (owned.ts), so the name and look go with it. */
  const keep = async () => {
    if (pending) return
    setPending("keep")
    setError(null)
    try {
      await becomeGuest()
      const { error: failed } = await authClient.signIn.social({
        provider: "google",
        callbackURL: next,
      })
      if (failed)
        throw new Error("Google didn't open. You're in as a guest; keep it from settings.")
    } catch (failed) {
      setPending(null)
      setError((failed as Error).message)
      // the guest exists now: let them in rather than strand them on the door
      router.refresh()
    }
  }

  const signIn = async () => {
    if (pending) return
    setPending("signin")
    setError(null)
    const { error: failed } = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
    })
    if (failed) {
      setPending(null)
      setError("Google didn't open. Try again.")
    }
  }

  const choosePhoto = () => {
    if (photo) {
      setUsePhoto(true)
      sound("tap")
      return
    }
    photoRef.current?.click()
  }

  return (
    <form
      ref={cardRef}
      className={`claim-card is-gate${leaving ? " is-leaving" : ""}`}
      aria-label="Enter Konkyo"
      onSubmit={(event) => void enter(event)}
      style={{ "--look": lookColor } as CSSProperties}
    >
      <div className="claim-room">
        <span className="claim-card-kicker">you&apos;re walking into</span>
        <div className="claim-room-name">
          <span
            className="claim-room-color"
            style={{ backgroundColor: "var(--color-lime)" }}
            aria-hidden="true"
          />
          <strong>konkyo</strong>
        </div>
        <div className="claim-room-here">
          {here.looks.length > 0 && (
            <div className="claim-room-faces" aria-hidden="true">
              {here.looks.map((id, i) => {
                const face = LOOKS.find((l) => l.id === id)
                return face ? (
                  <MemberFace
                    // biome-ignore lint/suspicious/noArrayIndexKey: two people can share a look
                    key={`${id}-${i}`}
                    face={{
                      name: face.name,
                      src: `/looks/${face.id}.webp`,
                      color: SPACES.colors[face.color].hex,
                    }}
                    size="sm"
                  />
                ) : null
              })}
            </div>
          )}
          <span>
            <i aria-hidden="true" />
            {here.count > 0
              ? `${here.count} ${here.count === 1 ? "person" : "people"} reading right now`
              : "nobody in yet · you're first"}
          </span>
        </div>
      </div>

      <p className="claim-gate-note">
        no account needed. your name is just what your library sees.
      </p>

      <label className="claim-name-label">
        your name
        <input
          ref={nameRef}
          className="claim-name-input"
          value={name}
          maxLength={PEOPLE.nameMax}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => !name.trim() && setName(look.name)}
          aria-label="Your name"
          disabled={leaving}
        />
      </label>

      <div className="claim-picker-section">
        <span className="claim-picker-label">pick a look</span>
        <LookRow
          name={name}
          selected={usePhoto ? "photo" : lookId}
          photo={photo?.url ?? null}
          onPick={pickLook}
          onPhoto={choosePhoto}
        />
      </div>
      <PhotoInput
        ref={photoRef}
        onPhoto={async (blob) => {
          if (photo) URL.revokeObjectURL(photo.url)
          setPhoto({ blob, url: URL.createObjectURL(blob) })
          setUsePhoto(true)
        }}
      />

      {error && (
        <span className="join-form-error" role="alert">
          {error}
        </span>
      )}

      <button type="submit" className="claim-done" disabled={pending !== null}>
        {pending === "enter" ? "opening the door…" : "enter →"}
      </button>

      <span className="claim-join-links">
        <button
          type="button"
          className="claim-join-link"
          onClick={() => void keep()}
          disabled={pending !== null}
        >
          {pending === "keep" ? "opening Google…" : "keep this on your other devices"}
        </button>
        <button
          type="button"
          className="claim-join-link"
          onClick={() => void signIn()}
          disabled={pending !== null}
        >
          {pending === "signin" ? "opening Google…" : "been here before? sign in"}
        </button>
      </span>
    </form>
  )
}
