"use client"

/*
 * The header's invite button and its popover, with the people in the space with their roles (the owner changes or removes them), what
 * a new link gives, the public read-only link, and leaving (plan F56); and, when the server sends
 * email, an invite by email and the space's own address to mail papers to (F59).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import type { Invite, Member } from "@/lib/members"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"
import { useQuery } from "@/lib/use-query"
import { openShareFolder } from "../shell/app-dialogs"
import { usePresence } from "../shell/live-provider"
import { MemberFace } from "./member-face"

type Role = "owner" | "add" | "read"

const ROLE_WORDS = { owner: "owner", add: "can add", read: "can read" } as const

export function InviteButton({
  spaceId,
  name,
  role,
}: {
  spaceId: string
  name: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const { data } = useQuery({
    queryKey: qk.spaces.members(spaceId),
    queryFn: () => api<{ members: Member[] }>(`/api/spaces/${spaceId}/members`),
  })
  const members = data?.members ?? []
  const here = usePresence(spaceId)
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`invite-button${open ? " is-active" : ""}`}
        onClick={() => {
          sound("tap")
          setOpen((was) => !was)
        }}
        aria-expanded={open}
        aria-label={role === "read" ? "People in this space" : "Invite people into this space"}
      >
        {members.length > 1 ? (
          <span className="invite-face-stack" aria-hidden="true">
            {members.slice(0, 3).map((m) => (
              <MemberFace key={m.userId} face={m.face} size="xs" />
            ))}
          </span>
        ) : (
          <svg
            className="invite-button-icon"
            viewBox="0 0 12 12"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path
              d="M2.75 9.25l6.5-6.5M4.25 2.75h5v5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        )}
        <span className="invite-button-label">{role === "read" ? "people" : "invite"}</span>
        {here.length > 1 && (
          <span className="invite-here" title={`${here.length} here right now`}>
            <i aria-hidden="true" />
            {here.length} here
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <InvitePopover
            spaceId={spaceId}
            name={name}
            role={role}
            members={members}
            here={here}
            anchor={button.current}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  )
}

function InvitePopover({
  spaceId,
  name,
  role,
  members,
  here,
  anchor,
  onClose,
}: {
  spaceId: string
  name: string
  role: Role
  members: Member[]
  here: { userId: string; face: Member["face"] }[]
  anchor: HTMLElement | null
  onClose: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [place, setPlace] = useState({ top: 90, right: 28 })
  const [copied, setCopied] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [take, setTake] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const panel = useRef<HTMLElement>(null)
  // under the button, its right edge lined up
  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect()
    if (r) setPlace({ top: r.bottom + 10, right: Math.max(16, window.innerWidth - r.right) })
  }, [anchor])
  // A dialog: focus goes in, Escape closes it, and focus returns to the invite button.
  const close = useEffectEvent(() => onClose())
  useEffect(() => {
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close()
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      anchor?.focus()
    }
  }, [anchor])

  const canInvite = role !== "read"
  const { data: inviteData } = useQuery({
    queryKey: qk.spaces.invite(spaceId),
    queryFn: () => api<{ invite: Invite | null; email: boolean }>(`/api/spaces/${spaceId}/invite`),
    enabled: canInvite,
  })
  const { data: addressData } = useQuery({
    queryKey: ["space-address", spaceId],
    queryFn: () => api<{ address: string | null }>(`/api/spaces/${spaceId}/address`),
    enabled: canInvite,
  })
  const address = addressData?.address ?? null
  const [mailTo, setMailTo] = useState("")
  const invite = inviteData?.invite ?? null
  const url =
    invite && typeof window !== "undefined" ? `${window.location.origin}${invite.path}` : ""

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.spaces.members(spaceId) })
    void queryClient.invalidateQueries({ queryKey: qk.spaces.list() })
  }
  const reset = useMutation({
    mutationFn: (next: "add" | "read") =>
      api<{ invite: Invite }>(`/api/spaces/${spaceId}/invite`, {
        method: "POST",
        json: { role: next },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(qk.spaces.invite(spaceId), result)
      toast("A new link", { description: "The old one stopped working." })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const sendInvite = useMutation({
    mutationFn: (email: string) =>
      api(`/api/spaces/${spaceId}/invite/email`, { method: "POST", json: { email } }),
    onSuccess: (_, email) => {
      setMailTo("")
      sound("place")
      toast("Invite sent", { description: `${email} gets the link by email.` })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const newAddress = useMutation({
    mutationFn: () =>
      api<{ address: string }>(`/api/spaces/${spaceId}/address`, { method: "POST" }),
    onSuccess: (result) => {
      queryClient.setQueryData(["space-address", spaceId], result)
      toast("A new address", { description: "The old one stopped working." })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const changeRole = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: "add" | "read" }) =>
      api(`/api/spaces/${spaceId}/members/${userId}`, { method: "PATCH", json: { role: next } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  })
  const remove = useMutation({
    mutationFn: (userId: string) =>
      api(`/api/spaces/${spaceId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  })
  const leave = useMutation({
    mutationFn: () => api(`/api/spaces/${spaceId}/leave`, { method: "POST", json: { take } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.spaces.all })
      void queryClient.invalidateQueries({ queryKey: ["folders"] })
      toast(`You left ${name}`)
      onClose()
      router.push("/home" as Route)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      sound("tap")
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      input.current?.select()
    }
  }

  return (
    <div className="invite-popover-layer">
      <button
        type="button"
        className="invite-popover-backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <section
        ref={panel}
        role="dialog"
        tabIndex={-1}
        className="invite-popover"
        // it fits below its button: everything in it scrolls into reach on a short screen
        style={{
          top: place.top,
          right: place.right,
          maxHeight: `calc(100dvh - ${place.top + 16}px)`,
        }}
        aria-label={`People in ${name}`}
      >
        <div className="invite-popover-heading">
          <div>
            <span className="invite-popover-kicker">
              {canInvite ? "bring people in" : "who's in here"}
            </span>
            <h2>{canInvite ? `bring people into ${name.toLowerCase()}` : name.toLowerCase()}</h2>
            {canInvite && (
              <p>
                anyone with this link can walk in and{" "}
                {invite?.role === "read" ? "read and ask" : "add their own sources"}
              </p>
            )}
          </div>
          <button
            type="button"
            className="invite-popover-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {canInvite && (
          <>
            <label className="invite-url-label">
              invite link
              <input
                ref={input}
                className="invite-url-input"
                value={url || "making a link…"}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Invite link"
              />
            </label>
            <div className="invite-popover-actions">
              <button
                type="button"
                className="invite-copy-button"
                onClick={() => void copy()}
                disabled={!url}
              >
                {copied ? "copied ✓" : "copy link"}
              </button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && url && (
                <button
                  type="button"
                  className="invite-share-button"
                  onClick={() => void navigator.share({ title: name, url }).catch(() => undefined)}
                >
                  share…
                </button>
              )}
            </div>
          </>
        )}

        {canInvite && inviteData?.email && (
          <form
            className="invite-email"
            onSubmit={(event) => {
              event.preventDefault()
              const email = mailTo.trim()
              if (email) sendInvite.mutate(email)
            }}
          >
            <label className="invite-url-label">
              or send it by email
              <input
                className="invite-url-input"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="friend@email.com"
                value={mailTo}
                maxLength={254}
                onChange={(event) => setMailTo(event.target.value)}
                aria-label="Their email"
              />
            </label>
            <button
              type="submit"
              className="invite-copy-button"
              disabled={!mailTo.trim() || sendInvite.isPending}
            >
              {sendInvite.isPending ? "sending…" : "send invite"}
            </button>
          </form>
        )}

        {canInvite && address && (
          <div className="invite-address">
            <span className="invite-popover-kicker">email this space</span>
            <p>
              forward a paper here and it lands on the wall. mail from anyone else waits for{" "}
              {role === "owner" ? "your" : "the owner's"} yes.
            </p>
            <div className="invite-popover-actions">
              <button
                type="button"
                className="invite-share-button invite-address-chip"
                title="Copy the address"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(address)
                    .then(() => {
                      sound("tap")
                      toast("Address copied", { description: address })
                    })
                    .catch(() => toast(address))
                }
              >
                ✉ {address}
              </button>
              {role === "owner" && (
                <button
                  type="button"
                  className="invite-leave-link"
                  disabled={newAddress.isPending}
                  onClick={() => newAddress.mutate()}
                >
                  new address
                </button>
              )}
            </div>
          </div>
        )}

        {role === "owner" && (
          <fieldset className="invite-gives">
            <legend className="invite-popover-kicker">a new link lets people</legend>
            <div>
              {(["add", "read"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={invite?.role === r ? "is-on" : undefined}
                  disabled={reset.isPending}
                  onClick={() => reset.mutate(r)}
                >
                  {r === "add" ? "add sources" : "read and ask"}
                </button>
              ))}
            </div>
            <small>choosing makes a new link; the old one stops working</small>
          </fieldset>
        )}

        {here.length > 0 && (
          <div className="invite-popover-presence">
            <div className="invite-face-stack" aria-hidden="true">
              {here.slice(0, 6).map((p) => (
                <MemberFace key={p.userId} face={p.face} size="sm" />
              ))}
            </div>
            <strong>{here.length} here right now</strong>
          </div>
        )}

        <div className="invite-people">
          <span className="invite-popover-kicker">
            {members.length} {members.length === 1 ? "person" : "people"} in here
          </span>
          <ul>
            {members.map((m) => (
              <li key={m.userId}>
                <MemberFace face={m.face} size="sm" />
                <span className="invite-person-name">
                  {m.name}
                  {m.you ? " (you)" : ""}
                </span>
                {role === "owner" && m.role !== "owner" ? (
                  <>
                    <select
                      aria-label={`What ${m.name} can do`}
                      value={m.role}
                      onChange={(event) =>
                        changeRole.mutate({
                          userId: m.userId,
                          next: event.target.value as "add" | "read",
                        })
                      }
                    >
                      <option value="add">can add</option>
                      <option value="read">can read</option>
                    </select>
                    <button
                      type="button"
                      className="invite-remove"
                      aria-label={`Take ${m.name} out of this space`}
                      title="take them out (their sources leave with them)"
                      onClick={() => remove.mutate(m.userId)}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <span className="invite-role">{ROLE_WORDS[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {role === "owner" ? (
          <div className="invite-public">
            <span className="invite-popover-kicker">public read-only link</span>
            <p>for anyone, no joining: it shows your own sources in here, not the others&apos;.</p>
            <button
              type="button"
              className="invite-share-button"
              onClick={() => {
                onClose()
                openShareFolder(spaceId, name)
              }}
            >
              public link ↗
            </button>
          </div>
        ) : leaving ? (
          <div className="invite-leave">
            <label>
              <input type="checkbox" checked={take} onChange={(e) => setTake(e.target.checked)} />
              take my sources out with me
            </label>
            <div className="invite-popover-actions">
              <button
                type="button"
                className="invite-share-button"
                onClick={() => setLeaving(false)}
              >
                stay
              </button>
              <button
                type="button"
                className="invite-copy-button is-danger"
                disabled={leave.isPending}
                onClick={() => leave.mutate()}
              >
                leave {name.toLowerCase()}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="invite-leave-link" onClick={() => setLeaving(true)}>
            leave this space
          </button>
        )}
      </section>
    </div>
  )
}
