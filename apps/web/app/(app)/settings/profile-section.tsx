"use client"

import { APP, PEOPLE } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { Input } from "@konkyo/ui/components/input"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Spinner } from "@konkyo/ui/components/spinner"
import { Textarea } from "@konkyo/ui/components/textarea"
import { cn } from "@konkyo/ui/lib/utils"
import { CameraIcon, CheckIcon, CircleCheckIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { openKeep } from "@/components/people/keep-dialog"
import { LookRow } from "@/components/people/look-row"
import { MemberFace } from "@/components/people/member-face"
import { PhotoInput } from "@/components/people/photo-input"
import { api } from "@/lib/fetcher"
import { sound } from "@/lib/sounds"
import { type Me, useMe } from "@/lib/use-me"

type HandleCheck = { handle: string; ok: boolean; problem: string | null }

const label = "text-snippet font-semibold text-ink"

/** Keep a guest's work: signing in while a guest links the two (owned.ts moves everything). */
const keepAccount = () =>
  openKeep("your name, your look, your library: kept, so you're the same person on your phone.")

/**
 * Settings → you: your face and name, the look you wear, and your public page. Each change
 * saves as you make it, except the page's handle and line, which wait for a Save so a half-typed
 * handle is never claimed.
 */
export function ProfileSection() {
  const { me } = useMe()
  if (!me) return <Skeleton className="h-96 w-full" />
  return <Profile me={me} />
}

function Profile({ me }: { me: Me }) {
  const { save, photo, removePhoto } = useMe()
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(me.name)
  // Saved elsewhere (a refused save rolled back): show it, unless you're typing.
  useEffect(() => {
    if (document.activeElement !== nameRef.current) setName(me.name)
  }, [me.name])

  const commitName = () => {
    const next = name.trim()
    if (!next) return setName(me.name)
    if (next !== me.name) save.mutate({ name: next })
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photo.isPending}
          aria-label="Change your photo"
          title="Use a photo of you"
          style={{ "--look": me.face.color } as CSSProperties}
          className="group relative shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <MemberFace
            face={me.face}
            size="lg"
            className={cn("transition-opacity", photo.isPending && "opacity-50")}
          />
          <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-sticker text-white ring-[3px] ring-paper-card transition-transform group-hover:scale-110">
            {photo.isPending ? (
              <Spinner className="size-3.5" />
            ) : (
              <CameraIcon className="size-3.5" />
            )}
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="profile-name" className={label}>
            Your name
          </label>
          <Input
            id="profile-name"
            ref={nameRef}
            value={name}
            maxLength={PEOPLE.nameMax}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            className="h-12 rounded-2xl bg-white px-4 font-display text-[22px] font-extrabold tracking-[-0.03em] md:text-[22px]"
          />
          <AccountLine me={me} />
        </div>
      </div>
      <PhotoInput ref={fileRef} onPhoto={(blob) => photo.mutateAsync(blob)} />

      <div className="space-y-3">
        <p className={label}>Your look</p>
        <div className="profile-looks rounded-2xl bg-sticker px-4 pt-3 text-white">
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
        </div>
        {(me.hasGoogle && me.avatar !== "google") || me.hasPhoto ? (
          <div className="flex flex-wrap gap-2">
            {me.hasGoogle && me.avatar !== "google" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => save.mutate({ avatar: "google" })}
              >
                Use my Google photo
              </Button>
            )}
            {me.hasPhoto && (
              <Button
                variant="ghost"
                size="sm"
                className="text-ink hover:bg-ink/8 hover:text-ink"
                onClick={() => removePhoto.mutate()}
                disabled={removePhoto.isPending}
              >
                Remove my photo
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <YourPage me={me} />
    </div>
  )
}

/** Where your name and look are kept: a guest's live in this browser, a kept account's follow you. */
function AccountLine({ me }: { me: Me }) {
  if (me.isGuest)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-snippet text-ash-gray">
        <span className="inline-flex items-center gap-1.5">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-saffron-spark" aria-hidden />
          Guest: this name, look and library live in this browser only.
        </span>
        <Button size="sm" onClick={keepAccount}>
          Keep it on every device
        </Button>
      </div>
    )
  return (
    <p className="flex items-start gap-1.5 text-snippet text-ash-gray">
      <CircleCheckIcon className="mt-px size-3.5 shrink-0 text-verified" aria-hidden />
      <span>
        Kept on <strong className="font-semibold text-ink">{me.email}</strong>. Your name and look
        follow you to every device you sign in on.
      </span>
    </p>
  )
}

/**
 * Your page (F54): a handle and a one-line bio make /u/<handle>. Guests are told why it waits,
 * right where it would be.
 */
function YourPage({ me }: { me: Me }) {
  const { save } = useMe()
  const [handle, setHandle] = useState(me.handle ?? "")
  const [bio, setBio] = useState(me.bio ?? "")
  const [check, setCheck] = useState<HandleCheck | null>(null)
  // A character was refused: say what a handle is made of, only now, only once it matters.
  const [refused, setRefused] = useState(false)
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
      <div className="space-y-3">
        <p className={label}>Your page</p>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line-strong p-4 text-snippet text-ash-gray">
          <p className="min-w-0 flex-1">
            A page with your name, a handle and your public spaces needs a kept account. Keep this
            library first, then claim your @handle here.
          </p>
          <Button variant="secondary" size="sm" onClick={keepAccount}>
            Keep this library
          </Button>
        </div>
      </div>
    )

  const asked = wanted && wanted !== me.handle ? check?.handle === wanted : false
  const free = asked && check?.ok
  const taken = asked && check?.ok === false
  const changed = wanted !== (me.handle ?? "") || bio.trim() !== (me.bio ?? "")
  const blocked = Boolean(taken)
  const reset = () => {
    setHandle(me.handle ?? "")
    setBio(me.bio ?? "")
    setRefused(false)
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!changed || blocked || save.isPending) return
        save.mutate(
          { handle: wanted || null, bio: bio.trim() || null },
          { onSuccess: () => toast.success(wanted ? `Your page is at /u/${wanted}` : "Saved") },
        )
      }}
    >
      <label htmlFor="profile-handle" className={label}>
        Your page
      </label>
      <div className="flex items-center gap-0 rounded-xl border border-input bg-white transition-colors focus-within:border-lime focus-within:ring-3 focus-within:ring-lime/25">
        <span className="pl-3 text-ui whitespace-nowrap text-ash-gray select-none">
          {APP.url.replace("https://", "")}/u/
        </span>
        <Input
          id="profile-handle"
          value={handle}
          maxLength={PEOPLE.handleMax}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="your_handle"
          aria-invalid={taken || undefined}
          aria-describedby="profile-handle-note"
          onChange={(event) => {
            const clean = event.target.value.replace(/[^a-zA-Z0-9_]/g, "")
            setRefused(clean !== event.target.value)
            setHandle(clean)
          }}
          className="h-10 min-w-0 flex-1 border-0 bg-transparent pl-0 font-semibold ring-0 focus-visible:ring-0 dark:bg-transparent"
        />
        <span className="grid w-9 shrink-0 place-items-center" aria-hidden>
          {free ? (
            <CheckIcon className="size-4 text-verified" strokeWidth={2.5} />
          ) : taken ? (
            <XIcon className="size-4 text-contradicts" strokeWidth={2.5} />
          ) : null}
        </span>
      </div>
      <p
        id="profile-handle-note"
        aria-live="polite"
        className={cn(
          "min-h-4 text-meta",
          taken ? "text-contradicts" : free ? "text-verified" : "text-ash-gray",
        )}
      >
        {taken
          ? (check?.problem ?? "That one's taken.")
          : free
            ? `@${wanted} is yours if you want it.`
            : refused
              ? "Handles use letters, numbers and underscores."
              : me.handle && wanted === me.handle
                ? "This is your page's address."
                : ""}
      </p>
      <Textarea
        value={bio}
        maxLength={PEOPLE.bioMax}
        placeholder="One line about what you read"
        aria-label="Your bio"
        rows={2}
        onChange={(event) => setBio(event.target.value)}
        className="min-h-0 rounded-xl bg-white"
      />
      {changed && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-ink hover:bg-ink/8 hover:text-ink"
            onClick={reset}
          >
            Discard
          </Button>
          <Button type="submit" size="sm" disabled={blocked || save.isPending}>
            {save.isPending ? "Saving…" : "Save my page"}
          </Button>
        </div>
      )}
    </form>
  )
}
