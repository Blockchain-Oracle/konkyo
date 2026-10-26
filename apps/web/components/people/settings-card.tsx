"use client"

/*
 * The settings card behind the rail's "you" tile: your name and look, your page
 * (a handle and a bio for a kept account), the ways to the full settings and the trash, and a
 * guest's sign-out that says what it deletes.
 */

import { APP, PEOPLE, ROUTES } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/fetcher"
import type { Face } from "@/lib/profiles"
import { sound } from "@/lib/sounds"
import { deleteMyAccount } from "@/lib/use-account"
import { type Me, useMe } from "@/lib/use-me"
import { openKeep } from "./keep-dialog"
import { LookRow } from "./look-row"
import { MemberFace } from "./member-face"
import { PhotoInput } from "./photo-input"

export type ShellUser = {
  name: string
  isGuest: boolean
  face: Face
}

/** Your face at the foot of the rail (or the phone bar): it opens the settings card. */
export function YouTile({ user }: { user: ShellUser }) {
  const { me } = useMe()
  const [open, setOpen] = useState(false)
  const face = me?.face ?? user.face
  return (
    <>
      <button
        type="button"
        className={`rail-you${open ? " is-open" : ""}`}
        style={{ "--look": face.color } as CSSProperties}
        onClick={() => {
          sound("tap")
          setOpen((was) => !was)
        }}
        aria-label={`${face.name}: you and settings`}
        aria-expanded={open}
        title="you · settings"
      >
        <MemberFace face={face} size="sm" />
        <span className="rail-you-gear" aria-hidden>
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
            <path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm6.1 3.6-.1-1.6 1.4-1.1-1.5-2.6-1.7.6-1.3-.9L10.6 1H7.6l-.3 1.8-1.4.8-1.6-.6-1.5 2.6L4.2 7.2 4 8.8l-1.3 1.1 1.5 2.6 1.7-.6 1.3.9.3 1.8h3l.3-1.8 1.4-.8 1.6.6 1.5-2.6Z" />
          </svg>
        </span>
      </button>
      {/* On the page itself: inside the rail it would share the rail's layer, under the dock. */}
      {open &&
        me &&
        createPortal(<SettingsCard me={me} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function SettingsCard({ me, onClose }: { me: Me; onClose: () => void }) {
  const router = useRouter()
  const [confirmLeave, setConfirmLeave] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const signOut = async () => {
    await authClient.signOut()
    router.replace(ROUTES.signIn as Route)
    router.refresh()
  }

  // Nobody can sign back in as a guest, so leaving deletes what the session made (as it says).
  const leaveAsGuest = async () => {
    try {
      await deleteMyAccount()
      router.replace(ROUTES.signIn as Route)
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <>
      <div className="settings-scrim" onClick={onClose} aria-hidden="true" />
      <section className="settings-sheet" aria-label="You and settings">
        <div className="claim-card-heading settings-heading">
          <div>
            <span className="claim-card-kicker">settings</span>
            <strong>you&apos;re {me.name}</strong>
            <span>{me.isGuest ? "just in this browser, for now" : "kept on every device"}</span>
          </div>
          <button
            type="button"
            className="claim-card-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <SettingsBody me={me} />

        <nav className="settings-links" aria-label="More">
          <Link href={ROUTES.settings as Route} onClick={onClose}>
            all settings
          </Link>
          <Link href={"/people" as Route} onClick={onClose}>
            people
          </Link>
          <Link href={ROUTES.trash as Route} onClick={onClose}>
            trash
          </Link>
          <Link href={"/briefs" as Route} onClick={onClose}>
            briefs
          </Link>
          <Link href={"/knows" as Route} onClick={onClose}>
            what konkyo knows
          </Link>
          {APP.docs && (
            <a href={APP.docs} target="_blank" rel="noreferrer">
              docs <span aria-hidden="true">↗</span>
            </a>
          )}
          <Link href={"/made-with/zetaris" as Route} onClick={onClose}>
            made with
          </Link>
          <button
            type="button"
            onClick={() => (me.isGuest ? setConfirmLeave(true) : void signOut())}
          >
            sign out
          </button>
          {me.handle && (
            <Link className="settings-me-link" href={`/u/${me.handle}` as Route} onClick={onClose}>
              your page <span aria-hidden="true">↗</span>
            </Link>
          )}
        </nav>
      </section>

      {/* A guest has no way back in, so signing out is confirmed and keeping it is offered first. */}
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent showCloseButton={false}>
          <DialogTitle className="text-subhead font-normal">
            Sign out of this guest session?
          </DialogTitle>
          <DialogDescription className="text-ui text-ash-gray">
            Guests can't sign back in, so everything you made here is deleted. Keep it first, with
            an email code or Google, to take it with you.
          </DialogDescription>
          <DialogFooter className="mt-3 gap-2">
            <Button variant="ghost" onClick={() => void leaveAsGuest()}>
              Sign out and delete
            </Button>
            <Button
              onClick={() => {
                setConfirmLeave(false)
                keepAccount()
              }}
            >
              Keep it first
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Keep a guest's work: signing in while a guest links the two (owned.ts moves everything). */
const keepAccount = () =>
  openKeep("your name, your look, your library: kept, so you're the same person on your phone.")

/**
 * Who you are, shared by the card off the rail and the "you" section of Settings: your face and
 * name, the looks and your photo, the account that keeps them, and your page.
 */
export function SettingsBody({ me }: { me: Me }) {
  const { save, photo, removePhoto } = useMe()
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(me.name)
  // Saved elsewhere (the other card, a refused save rolled back): show it, unless you're typing.
  useEffect(() => {
    if (document.activeElement !== nameRef.current) setName(me.name)
  }, [me.name])

  const commitName = () => {
    const next = name.trim()
    if (!next) return setName(me.name)
    if (next !== me.name) save.mutate({ name: next })
  }

  return (
    <>
      <div className="settings-you">
        <button
          type="button"
          className={`settings-face${photo.isPending ? " is-busy" : ""}`}
          style={{ "--look": me.face.color } as CSSProperties}
          onClick={() => fileRef.current?.click()}
          title="use a photo of you"
        >
          <MemberFace face={me.face} size="lg" />
          <span className="settings-face-hint">{photo.isPending ? "…" : "photo"}</span>
        </button>
        <label className="claim-name-label settings-name">
          your name
          <input
            ref={nameRef}
            className="claim-name-input"
            value={name}
            maxLength={PEOPLE.nameMax}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            aria-label="Your name"
          />
        </label>
      </div>

      <div className="claim-picker-section">
        <span className="claim-picker-label">your look</span>
        <LookRow
          name={me.name}
          selected={me.avatar === "photo" ? "photo" : me.avatar === "look" ? me.lookId : null}
          photo={me.hasPhoto && me.avatar === "photo" ? me.face.src : null}
          onPick={(look) => {
            sound("tap")
            save.mutate({ lookId: look.id, avatar: "look" })
          }}
          onPhoto={() =>
            me.hasPhoto && me.avatar !== "photo"
              ? save.mutate({ avatar: "photo" })
              : fileRef.current?.click()
          }
        />
        <span className="settings-face-links">
          {me.hasGoogle && me.avatar !== "google" && (
            <button
              type="button"
              className="claim-join-link"
              onClick={() => save.mutate({ avatar: "google" })}
            >
              use my Google photo
            </button>
          )}
          {me.hasPhoto && (
            <button
              type="button"
              className="claim-join-link"
              onClick={() => removePhoto.mutate()}
              disabled={removePhoto.isPending}
            >
              remove my photo
            </button>
          )}
        </span>
      </div>
      <PhotoInput ref={fileRef} onPhoto={(blob) => photo.mutateAsync(blob)} />

      <div className="settings-account">
        <span className="claim-picker-label">account</span>
        {me.isGuest ? (
          <div className="settings-account-row">
            <span className="settings-account-email">
              this name, this look and everything in your library live in this browser only.
            </span>
            <button type="button" className="claim-done settings-keep" onClick={keepAccount}>
              keep this on my other devices <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : (
          <div className="settings-account-row">
            <span className="settings-account-email" title={me.email ?? undefined}>
              saved to <strong>{me.email}</strong> ✓ this name and look come back on every device
              you sign in on.
            </span>
          </div>
        )}
      </div>

      <YourPage me={me} />
    </>
  )
}

/** Settings' "you" section: the same card, laid on the page. */
export function YouCard() {
  const { me } = useMe()
  if (!me) return <div className="me-card settings-you-card is-loading" aria-busy />
  return (
    <section className="me-card settings-you-card" aria-label="You">
      <div className="claim-card-heading settings-heading">
        <div>
          <span className="claim-card-kicker">you</span>
          <strong>you&apos;re {me.name}</strong>
          <span>{me.isGuest ? "just in this browser, for now" : "kept on every device"}</span>
        </div>
        {me.handle && (
          <Link className="settings-me-link" href={`/u/${me.handle}` as Route}>
            your page <span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>
      <SettingsBody me={me} />
    </section>
  )
}

type HandleCheck = { handle: string; ok: boolean; problem: string | null }

/**
 * Your page (F54): a handle and a one-line bio make /u/<handle>. Guests are told why it waits,
 * right where it would be.
 */
function YourPage({ me }: { me: Me }) {
  const { save } = useMe()
  const [handle, setHandle] = useState(me.handle ?? "")
  const [bio, setBio] = useState(me.bio ?? "")
  const [check, setCheck] = useState<HandleCheck | null>(null)
  const wanted = handle.trim().toLowerCase()

  // Is it free? Asked a beat after you stop typing.
  useEffect(() => {
    if (me.isGuest || !wanted || wanted === me.handle) return setCheck(null)
    const timer = window.setTimeout(() => {
      api<HandleCheck>(`/api/handles/check?h=${encodeURIComponent(wanted)}`)
        .then(setCheck)
        .catch(() => setCheck(null))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [wanted, me.handle, me.isGuest])

  if (me.isGuest)
    return (
      <div className="settings-account">
        <span className="claim-picker-label">your page</span>
        <span className="settings-account-email">
          a page with your name, a handle and your public spaces needs a kept account. keep this
          first, then claim your @handle here.
        </span>
      </div>
    )

  const changed = wanted !== (me.handle ?? "") || bio.trim() !== (me.bio ?? "")
  const blocked = Boolean(wanted && wanted !== me.handle && check && !check.ok)
  const note =
    wanted && wanted !== me.handle && check?.handle === wanted
      ? check.ok
        ? { text: `@${wanted} is yours if you want it`, tone: "is-ok" }
        : { text: check.problem ?? "that one's taken", tone: "is-bad" }
      : me.handle
        ? { text: `konkyo.xyz/u/${me.handle}`, tone: "" }
        : { text: "letters, numbers and _ only", tone: "" }

  return (
    <form
      className="settings-account settings-page-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!changed || blocked || save.isPending) return
        save.mutate(
          { handle: wanted || null, bio: bio.trim() || null },
          { onSuccess: () => toast.success(wanted ? `Your page is at /u/${wanted}` : "Saved") },
        )
      }}
    >
      <span className="claim-picker-label">your page</span>
      <label className="settings-handle">
        <span aria-hidden="true">@</span>
        <input
          className="claim-name-input"
          value={handle}
          maxLength={PEOPLE.handleMax}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="your_handle"
          onChange={(event) => setHandle(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          aria-label="Your handle"
        />
      </label>
      <span className={`settings-handle-note ${note.tone}`} aria-live="polite">
        {note.text}
      </span>
      <textarea
        className="claim-name-input"
        value={bio}
        maxLength={PEOPLE.bioMax}
        placeholder="one line about what you read"
        onChange={(event) => setBio(event.target.value)}
        aria-label="Your bio"
      />
      {changed && (
        <button
          type="submit"
          className="claim-done settings-keep"
          disabled={blocked || save.isPending}
        >
          {save.isPending ? "saving…" : "save my page"}
        </button>
      )}
    </form>
  )
}
