"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { MemberFace } from "@/components/people/member-face"
import { api } from "@/lib/fetcher"
import { sound } from "@/lib/sounds"
import type { Take } from "@/lib/takes"
import { useQuery } from "@/lib/use-query"

/** Takes per source in a space: the wall's chips read these counts. */
export function useTakeCounts(spaceId: string) {
  return useQuery({
    queryKey: ["takes", spaceId, "counts"],
    queryFn: () =>
      api<{ counts: Record<string, number> }>(`/api/spaces/${spaceId}/takes`).then((r) => r.counts),
  })
}

const when = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" })

/**
 * The chip on a source in a shared space: "“ 2 takes", or "your take" when there are none (shown
 * on hover). It opens the thread: who said what about this source, and a line for yours.
 */
export function TakesChip({
  spaceId,
  fileId,
  title,
  count,
}: {
  spaceId: string
  fileId: string
  title: string
  count: number
}) {
  const [open, setOpen] = useState(false)
  const chip = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={chip}
        type="button"
        className={`takes-chip${count ? " has-takes" : ""}${open ? " is-open" : ""}`}
        onClick={(event) => {
          event.stopPropagation()
          sound("tap")
          setOpen((was) => !was)
        }}
        aria-expanded={open}
        aria-label={count ? `${count} takes on ${title}` : `Your take on ${title}`}
      >
        <span aria-hidden="true">“</span>
        {count ? `${count} take${count === 1 ? "" : "s"}` : "your take"}
      </button>
      {open &&
        createPortal(
          <TakesPopover
            spaceId={spaceId}
            fileId={fileId}
            title={title}
            anchor={chip.current}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  )
}

function TakesPopover({
  spaceId,
  fileId,
  title,
  anchor,
  onClose,
}: {
  spaceId: string
  fileId: string
  title: string
  anchor: HTMLElement | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const key = ["takes", spaceId, fileId]
  const [text, setText] = useState("")
  const [place, setPlace] = useState({ top: 120, left: 120 })
  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(340, window.innerWidth - 32)
    setPlace({
      top: Math.min(r.bottom + 8, window.innerHeight - 360),
      left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)),
    })
  }, [anchor])
  const { data: takes } = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ takes: Take[] }>(`/api/spaces/${spaceId}/takes?file=${fileId}`).then((r) => r.takes),
  })
  const refresh = (next?: Take[]) => {
    if (next) queryClient.setQueryData(key, next)
    void queryClient.invalidateQueries({ queryKey: ["takes", spaceId, "counts"] })
  }
  const post = useMutation({
    mutationFn: () =>
      api<{ takes: Take[] }>(`/api/spaces/${spaceId}/takes`, {
        method: "POST",
        json: { fileId, body: text },
      }),
    onSuccess: ({ takes: next }) => {
      setText("")
      sound("place")
      refresh(next)
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const remove = useMutation({
    mutationFn: (takeId: string) =>
      api(`/api/spaces/${spaceId}/takes/${takeId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      refresh()
    },
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <div className="invite-popover-layer">
      <button
        type="button"
        className="invite-popover-backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <section
        className="invite-popover takes-popover"
        style={{ top: place.top, left: place.left, right: "auto" }}
        aria-label={`Takes on ${title}`}
      >
        <div className="invite-popover-heading">
          <div>
            <span className="invite-popover-kicker">takes on</span>
            <h2 className="takes-title">{title}</h2>
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
        <ul className="takes-list">
          {takes?.length ? (
            takes.map((take) => (
              <li key={take.id}>
                <MemberFace face={take.author.face} size="sm" />
                <div>
                  <span className="takes-who">
                    {take.mine ? "you" : take.author.name}
                    <small>{when.format(new Date(take.createdAt)).toLowerCase()}</small>
                  </span>
                  <p>{take.body}</p>
                </div>
                {take.canRemove && (
                  <button
                    type="button"
                    className="invite-remove"
                    onClick={() => remove.mutate(take.id)}
                    aria-label="Remove this take"
                  >
                    ×
                  </button>
                )}
              </li>
            ))
          ) : (
            <li className="takes-empty">{takes ? "no takes yet. be the first." : "…"}</li>
          )}
        </ul>
        <form
          className="takes-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (text.trim() && !post.isPending) post.mutate()
          }}
        >
          <textarea
            className="claim-name-input"
            value={text}
            maxLength={500}
            placeholder="your take…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            aria-label="Your take"
          />
          <button
            type="submit"
            className="invite-copy-button"
            disabled={!text.trim() || post.isPending}
          >
            {post.isPending ? "…" : "post"}
          </button>
        </form>
      </section>
    </div>
  )
}
