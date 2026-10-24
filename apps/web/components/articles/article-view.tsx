"use client"

import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand-mark"
import { whereIs } from "@/components/chat/citation-chip"
import { FollowButton } from "@/components/people/follow-button"
import { MemberFace } from "@/components/people/member-face"
import type { ArticleCitation, PublicArticle } from "@/lib/articles"
import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/fetcher"
import type { Relation } from "@/lib/people"
import { sound, tapAudio } from "@/lib/sounds"

/*
 * A published article (plan F57): Matter's reading header on cream paper, Perplexity-style source
 * chips. The body is drawn from the note's document through a whitelist (never raw HTML); a chip
 * opens its passage card: the quote in its passage, the source, page, DOI or link, the licence,
 * the cited page when it may be shown, and whether the quote was found again at publish.
 */

type PMNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: PMNode[]
}

const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" })

/** Only http(s) links leave the page. */
const safeHref = (href: unknown) =>
  typeof href === "string" && /^https?:\/\//i.test(href) ? href : null

export function ArticleView({
  article,
  viewer,
  relation,
}: {
  article: PublicArticle
  viewer: "signed-out" | "guest" | "kept"
  relation: Relation
}) {
  const [open, setOpen] = useState<ArticleCitation | null>(null)
  const citations = new Map(article.citations.map((c) => [c.n, c]))

  const inline = (node: PMNode, key: number): ReactNode => {
    if (node.type === "citation" && node.attrs) {
      // the server numbered them (by each passage's first appearance) and sends only the number
      const n = Number(node.attrs.n)
      const c = citations.get(n)
      return (
        <button
          key={key}
          type="button"
          className={`article-cite${c?.verified ? " is-verified" : ""}`}
          onClick={() => {
            sound("tap")
            if (c) setOpen(c)
          }}
          aria-label={`Source ${n}: ${c?.title ?? "a source"}`}
        >
          {n}
          {c?.verified && <span aria-hidden="true">✓</span>}
        </button>
      )
    }
    if (node.type === "hardBreak") return <br key={key} />
    if (node.type !== "text")
      return <Fragment key={key}>{(node.content ?? []).map(inline)}</Fragment>
    let out: ReactNode = node.text
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") out = <strong>{out}</strong>
      else if (mark.type === "italic") out = <em>{out}</em>
      else if (mark.type === "code") out = <code>{out}</code>
      else if (mark.type === "link") {
        const href = safeHref(mark.attrs?.href)
        if (href)
          out = (
            <a href={href} rel="noopener nofollow ugc" target="_blank">
              {out}
            </a>
          )
      }
    }
    return <Fragment key={key}>{out}</Fragment>
  }

  const block = (node: PMNode, key: number): ReactNode => {
    const kids = (node.content ?? []).map(inline)
    switch (node.type) {
      case "paragraph":
        return <p key={key}>{kids}</p>
      case "heading": {
        const level = Number(node.attrs?.level ?? 2)
        return level <= 2 ? <h2 key={key}>{kids}</h2> : <h3 key={key}>{kids}</h3>
      }
      case "blockquote":
        return <blockquote key={key}>{(node.content ?? []).map(block)}</blockquote>
      case "bulletList":
        return <ul key={key}>{(node.content ?? []).map(block)}</ul>
      case "orderedList":
        return <ol key={key}>{(node.content ?? []).map(block)}</ol>
      case "listItem":
        return <li key={key}>{(node.content ?? []).map(block)}</li>
      case "codeBlock":
        return (
          <pre key={key}>
            <code>{kids}</code>
          </pre>
        )
      case "horizontalRule":
        return <hr key={key} />
      default:
        return null
    }
  }

  const doc = article.content as PMNode
  const minutes = Math.max(1, Math.round(article.words / 230))
  const check = article.check

  return (
    <main className="article-page">
      <nav className="article-top">
        <Link className="me-back" href={"/" as Route}>
          <BrandMark small className="size-4" />
          konkyo
        </Link>
      </nav>
      <article className="article-paper">
        <header className="article-head">
          <p className="article-kicker">
            <span>article · {minutes} min read</span>
            {check && check.total > 0 && (
              <span className="article-check">
                ✓ {check.supported} of {check.total} claims supported
                {check.partly ? ` · ${check.partly} partly` : ""}
                {check.notFound ? ` · ${check.notFound} not found` : ""}
                {check.contradicted ? ` · ${check.contradicted} contradicted` : ""}
              </span>
            )}
          </p>
          <h1>{article.title}</h1>
          {article.summary && <p className="article-summary">{article.summary}</p>}
          <div className="article-byline">
            <Link href={`/u/${article.author.handle}` as Route} className="article-author">
              <MemberFace face={article.author.face} size="md" />
              <span>
                <strong>{article.author.name}</strong>
                <small>
                  @{article.author.handle} ·{" "}
                  {day.format(new Date(article.publishedAt)).toLowerCase()}
                  {article.updatedAt !== article.publishedAt ? " · updated" : ""}
                </small>
              </span>
            </Link>
            {!article.yours && (
              <FollowButton handle={article.author.handle} relation={relation} viewer={viewer} />
            )}
          </div>
        </header>
        {article.cover && (
          // biome-ignore lint/performance/noImgElement: same-origin cover webp
          <img className="article-cover" src={article.cover} alt="" />
        )}
        <div className="article-body">{(doc.content ?? []).map(block)}</div>

        {article.citations.length > 0 && (
          <section className="article-sources" aria-label="Sources">
            <h2>sources</h2>
            <ol>
              {article.citations.map((c) => (
                <li key={c.n}>
                  <button type="button" onClick={() => setOpen(c)}>
                    <span className="article-cite-n">{c.n}</span>
                    <span>
                      <strong>{c.title}</strong>
                      <small>{[c.byline, whereIs(c)].filter(Boolean).join(" · ")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
        <ArticleActions article={article} viewer={viewer} />
      </article>
      {open &&
        createPortal(<PassageCard citation={open} onClose={() => setOpen(null)} />, document.body)}
    </main>
  )
}

/** A citation's card: the quote marked in its passage, the source and where it is. */
function PassageCard({ citation: c, onClose }: { citation: ArticleCitation; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])
  const context = c.context ?? c.quote
  const at = context.indexOf(c.quote)
  const href = c.doi ? `https://doi.org/${c.doi}` : safeHref(c.url)
  return (
    <div className="publish-layer">
      <button type="button" className="publish-backdrop" onClick={onClose} aria-label="Close" />
      <section className="passage-card" aria-label={`Source ${c.n}`}>
        <div className="passage-card-head">
          <span className="article-cite-n">{c.n}</span>
          <div>
            <strong>{c.title}</strong>
            <small>
              {[c.byline, c.page ? `page ${c.page}` : c.tStart != null ? `at ${whereIs(c)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </small>
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
        <blockquote>
          {at >= 0 ? (
            <>
              {context.slice(0, at)}
              <mark>{c.quote}</mark>
              {context.slice(at + c.quote.length)}
            </>
          ) : (
            <mark>{c.quote}</mark>
          )}
        </blockquote>
        {c.pageImage && (
          // biome-ignore lint/performance/noImgElement: the cited page, same origin
          <img
            className="passage-card-page"
            src={c.pageImage}
            alt={`Page ${c.page} of ${c.title}`}
          />
        )}
        <div className="passage-card-foot">
          <span className={c.verified ? "is-verified" : "is-unchecked"}>
            {c.verified
              ? "✓ quote found in the source at publish"
              : "quote not re-found at publish"}
          </span>
          {c.licence?.name && <span>{c.licence.name.toUpperCase()}</span>}
          {href && (
            <a href={href} target="_blank" rel="noopener nofollow">
              {c.doi ? `doi:${c.doi}` : "the source"} ↗
            </a>
          )}
        </div>
      </section>
    </div>
  )
}

/** ♥, ▶ listen, save these sources, share, report. */
function ArticleActions({
  article,
  viewer,
}: {
  article: PublicArticle
  viewer: "signed-out" | "guest" | "kept"
}) {
  const router = useRouter()
  const [likes, setLikes] = useState({ n: article.likes, on: article.liked })
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)
  const player = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => player.current?.pause(), [])
  const toDoor = () => router.push(`/sign-in?next=/a/${article.slug}` as Route)

  const like = async () => {
    if (viewer === "signed-out") return toDoor()
    if (viewer === "guest")
      return void toast("♥ needs a kept account", {
        description: "Keep yours with Google: your library and your look come with you.",
        action: {
          label: "keep it",
          onClick: () =>
            void authClient.signIn.social({
              provider: "google",
              callbackURL: `/a/${article.slug}`,
            }),
        },
      })
    const next = !likes.on
    setLikes((l) => ({ n: l.n + (next ? 1 : -1), on: next }))
    try {
      const r = await api<{ likes: number; liked: boolean }>(`/api/a/${article.slug}/like`, {
        method: next ? "POST" : "DELETE",
      })
      setLikes({ n: r.likes, on: r.liked })
      if (next) sound("place")
    } catch (error) {
      setLikes({ n: article.likes, on: article.liked })
      toast.error((error as Error).message)
    }
  }
  const listen = async () => {
    if (viewer === "signed-out") return toDoor()
    if (playing) {
      player.current?.pause()
      player.current = null
      return setPlaying(false)
    }
    setPlaying(true)
    const audio = tapAudio()
    player.current = audio
    try {
      const { url } = await api<{ url: string }>(`/api/a/${article.slug}/listen`, {
        method: "POST",
      })
      if (player.current !== audio) return
      audio.onended = () => setPlaying(false)
      audio.src = url
      await audio.play()
    } catch (error) {
      setPlaying(false)
      toast.error((error as Error).message)
    }
  }
  const save = async () => {
    if (viewer === "signed-out") return toDoor()
    setSaving(true)
    try {
      const r = await api<{ spaceId: string; saved: number; total: number; unlinked: number }>(
        `/api/a/${article.slug}/save`,
        { method: "POST" },
      )
      sound("promote")
      toast.success(`${r.saved} of ${r.total} sources saved to a new space`, {
        description: r.unlinked
          ? `${r.unlinked} more ${r.unlinked === 1 ? "is the author's own file" : "are the author's own files"}, with no public link to save.`
          : undefined,
        action: { label: "open it", onClick: () => router.push(`/spaces/${r.spaceId}` as Route) },
      })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const share = async () => {
    const url = window.location.href
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches)
      return void navigator.share({ title: article.title, url }).catch(() => undefined)
    await navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }
  // the author's own way to take it down, from the article itself (asks with a second tap)
  const [taking, setTaking] = useState(false)
  const takeDown = async () => {
    if (!taking) return setTaking(true)
    try {
      await api(`/api/a/${article.slug}`, { method: "DELETE" })
      toast("Unpublished. The link doesn't work any more.")
      router.refresh()
    } catch (error) {
      setTaking(false)
      toast.error((error as Error).message)
    }
  }
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState("")
  const report = async () => {
    if (reason.trim().length < 3) return
    try {
      await api(`/api/a/${article.slug}/report`, { method: "POST", json: { reason } })
      toast("Thanks. It's been reported.")
      setReporting(false)
      setReason("")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <footer className="article-actions">
      <button type="button" className={likes.on ? "is-on" : undefined} onClick={() => void like()}>
        <span aria-hidden="true">♥</span> {likes.n}
      </button>
      <button type="button" className={playing ? "is-on" : undefined} onClick={() => void listen()}>
        <span aria-hidden="true">{playing ? "■" : "▶"}</span> listen
      </button>
      {article.citations.length > 0 && (
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "saving…" : "save these sources"}
        </button>
      )}
      <button type="button" onClick={() => void share()}>
        share
      </button>
      {article.yours ? (
        <button
          type="button"
          className="article-report"
          onClick={() => void takeDown()}
          onBlur={() => setTaking(false)}
        >
          {taking ? "tap again to unpublish" : "unpublish"}
        </button>
      ) : (
        <button
          type="button"
          className="article-report"
          onClick={() => (viewer === "signed-out" ? toDoor() : setReporting((r) => !r))}
        >
          report
        </button>
      )}
      {reporting && (
        <form
          className="article-report-form"
          onSubmit={(e) => {
            e.preventDefault()
            void report()
          }}
        >
          <input
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="what's wrong with it?"
            aria-label="Why you're reporting this article"
          />
          <button type="submit" disabled={reason.trim().length < 3}>
            send
          </button>
        </form>
      )}
    </footer>
  )
}
