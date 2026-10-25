"use client"

import { ARTICLES } from "@konkyo/config"
import { Switch } from "@konkyo/ui/components/switch"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { openKeep } from "@/components/people/keep-dialog"
import type { PublishState } from "@/lib/articles"
import { api } from "@/lib/fetcher"
import { sound } from "@/lib/sounds"
import { useQuery } from "@/lib/use-query"

/*
 * Publish a note (plan F57; Hashnode's draft settings in the house's dark card): title, the link
 * it'll have, a cover from a cited source's page one, a summary, whether pages of sources that
 * aren't openly licensed may show, and what Check my draft found, not-founds included. Publishing
 * needs a check of the note as it is now; the sheet runs one if there isn't.
 */

type Published = { slug: string; path: string; version: number }

export function PublishSheet({
  noteId,
  noteTitle,
  onClose,
}: {
  noteId: string
  noteTitle: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const key = ["publish", noteId]
  const { data: state, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api<PublishState>(`/api/notes/${noteId}/publish`),
  })
  const [title, setTitle] = useState(noteTitle)
  const [summary, setSummary] = useState("")
  const [showPages, setShowPages] = useState(false)
  const [cover, setCover] = useState<string | null>(null)
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null)
  const [published, setPublished] = useState<Published | null>(null)
  const seeded = useRef(false)

  // an article already out: start from what it says
  useEffect(() => {
    if (!state || seeded.current) return
    seeded.current = true
    if (state.article) {
      setTitle(state.article.title)
      setSummary(state.article.summary ?? "")
      setShowPages(state.article.showPages)
    }
    setCover(state.covers[0]?.fileId ?? null)
  }, [state])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])

  /** Check my draft, streamed: claims first, then a verdict each (the existing route). */
  const check = async () => {
    setChecking({ done: 0, total: 0 })
    try {
      const res = await fetch(`/api/notes/${noteId}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // the saved note, read by the server: what publishes is what was checked
        body: JSON.stringify({ saved: true }),
      })
      if (!res.ok || !res.body) throw new Error("The check didn't start. Try again.")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as { type: string; claims?: unknown[]; message?: string }
          if (event.type === "claims") setChecking({ done: 0, total: event.claims?.length ?? 0 })
          if (event.type === "result") setChecking((c) => c && { ...c, done: c.done + 1 })
          if (event.type === "error") throw new Error(event.message)
        }
      }
      await refetch()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setChecking(null)
    }
  }

  const publish = useMutation({
    mutationFn: () =>
      api<Published>(`/api/notes/${noteId}/publish`, {
        method: "POST",
        json: { title, summary: summary || null, showPages, coverFileId: cover ?? undefined },
      }),
    onSuccess: (result) => {
      sound("promote")
      setPublished(result)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const unpublish = useMutation({
    mutationFn: () => api(`/api/notes/${noteId}/publish`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Unpublished. The link doesn't work any more.")
      void refetch()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const link = (path: string) => `${window.location.origin}${path}`
  const slugPreview =
    state?.article?.slug ??
    `${(title || "untitled")
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)}-······`

  // Out already: where it lives, and the way to take it down (even when publishing is blocked).
  const live = state?.article?.published && (
    <div className="publish-live">
      <Link href={`/a/${state.article.slug}` as Route} target="_blank">
        it&apos;s live at /a/{state.article.slug} ↗
      </Link>
      <button
        type="button"
        className="claim-join-link"
        onClick={() => unpublish.mutate()}
        disabled={unpublish.isPending}
      >
        unpublish
      </button>
    </div>
  )

  return createPortal(
    <div className="publish-layer">
      <button type="button" className="publish-backdrop" onClick={onClose} aria-label="Close" />
      <section className="publish-sheet" aria-label="Publish this note">
        <div className="invite-popover-heading">
          <div>
            <span className="invite-popover-kicker">publish</span>
            <h2>{published ? "your article is live" : "put this on your page"}</h2>
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

        {published ? (
          <div className="publish-done">
            <span className="join-stamp">published ✓</span>
            <input
              className="invite-url-input"
              readOnly
              value={link(published.path)}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="The article's link"
            />
            <div className="invite-popover-actions">
              <button
                type="button"
                className="invite-copy-button"
                onClick={async () => {
                  await navigator.clipboard.writeText(link(published.path))
                  toast.success("Link copied")
                }}
              >
                copy link
              </button>
              <Link className="invite-share-button" href={published.path as Route} target="_blank">
                open ↗
              </Link>
            </div>
          </div>
        ) : !state ? (
          <p className="publish-note">…</p>
        ) : state.blocked ? (
          <div className="publish-blocked">
            <p>{state.blocked}</p>
            {state.blocked.startsWith("Publishing needs a kept account") && (
              <button
                type="button"
                className="claim-done"
                onClick={() =>
                  openKeep(
                    "an article carries your name: keep this library, then publish it from here.",
                    `/write/${noteId}`,
                  )
                }
              >
                keep this library <span aria-hidden="true">→</span>
              </button>
            )}
            {state.blocked.startsWith("Claim a handle") && (
              <Link className="claim-done" href={"/settings#you" as Route}>
                claim my handle
              </Link>
            )}
            {live}
          </div>
        ) : (
          <form
            className="publish-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (state.check?.current && !publish.isPending) publish.mutate()
            }}
          >
            <label className="invite-url-label">
              title
              <input
                className="claim-name-input"
                value={title}
                maxLength={ARTICLES.titleMax}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <p className="publish-link">konkyo.xyz/a/{slugPreview}</p>

            {state.covers.length > 0 && (
              <fieldset className="publish-covers">
                <legend className="invite-popover-kicker">
                  cover · a cited source&apos;s page one
                </legend>
                <div>
                  {state.covers.map((c) => (
                    <label key={c.fileId} className={cover === c.fileId ? "is-on" : undefined}>
                      <input
                        type="radio"
                        name="cover"
                        className="sr-only"
                        checked={cover === c.fileId}
                        onChange={() => setCover(c.fileId)}
                      />
                      {/* biome-ignore lint/performance/noImgElement: same-origin page-one webp */}
                      <img src={`/api/files/${c.fileId}/thumb`} alt={c.title} />
                    </label>
                  ))}
                  <label className={cover === null ? "is-on publish-no-cover" : "publish-no-cover"}>
                    <input
                      type="radio"
                      name="cover"
                      className="sr-only"
                      checked={cover === null}
                      onChange={() => setCover(null)}
                    />
                    none
                  </label>
                </div>
              </fieldset>
            )}

            <label className="invite-url-label">
              summary · what a reader gets
              <textarea
                className="claim-name-input"
                value={summary}
                maxLength={ARTICLES.summaryMax}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="one or two lines"
              />
            </label>

            <div className="publish-switch">
              <label htmlFor="publish-show-pages">
                <strong>show cited pages of every source</strong>
                <small>
                  Pages of openly licensed sources always show. Others only if you turn this on.
                </small>
              </label>
              <Switch
                id="publish-show-pages"
                checked={showPages}
                onCheckedChange={(on) => setShowPages(Boolean(on))}
              />
            </div>

            <div className="publish-check">
              <span className="invite-popover-kicker">what the check found</span>
              {checking ? (
                <p>
                  checking{" "}
                  {checking.total ? `${checking.done} of ${checking.total} claims` : "the claims"}…
                </p>
              ) : state.check?.current ? (
                <p>
                  <b>{state.check.supported}</b> of {state.check.total} claims supported
                  {state.check.partly ? ` · ${state.check.partly} partly` : ""}
                  {state.check.notFound ? ` · ${state.check.notFound} not found` : ""}
                  {state.check.contradicted ? ` · ${state.check.contradicted} contradicted` : ""}
                  <small>the article shows this as it is</small>
                </p>
              ) : (
                <p>
                  {state.check ? "the note changed since its last check." : "not checked yet."}{" "}
                  <button type="button" className="claim-join-link" onClick={() => void check()}>
                    check it now
                  </button>
                </p>
              )}
            </div>

            <button
              type="submit"
              className="claim-done"
              disabled={!state.check?.current || publish.isPending || Boolean(checking)}
            >
              {publish.isPending
                ? "publishing…"
                : !state.check?.current
                  ? "check it first"
                  : state.article?.published
                    ? "republish ↗"
                    : "publish ↗"}
            </button>
            {state.foreign > 0 && (
              <p className="publish-note">
                {state.foreign} citation{state.foreign === 1 ? " is" : "s are"} from sources that
                aren&apos;t yours (a teammate&apos;s, in a shared space): the article shows only the
                quote, not the source or its page.
              </p>
            )}
            <p className="publish-note">
              {state.citations} citation{state.citations === 1 ? "" : "s"} · {state.words} words ·{" "}
              {state.left} publish{state.left === 1 ? "" : "es"} left today
            </p>
            {live}
          </form>
        )}
      </section>
    </div>,
    document.body,
  )
}
