"use client"

import { SPACES } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { openSource } from "@/lib/preview"
import { sound } from "@/lib/sounds"
import type { SpaceRow } from "@/lib/use-spaces"
import { KIND_LABEL } from "./kind-icon"

/*
 * A space as a folder you can open: @kedhareswer/glass-folder-cards (21st.dev, MIT),
 * adapted. Its generated-art painter is gone: the back panel is the space's colour holding its
 * real cover, and the files are its newest sources' first pages. The frosted front is the one
 * glass in Konkyo, tinted in the space's colour and strongest where the label sits so
 * the label reads. Rest: closed, the tops of the pages showing. Hover or focus: the front leans
 * and the pages lift. Click, Enter or Space: the pages fan out, each one opens its source. The
 * key goes into the space. Escape or a press outside closes it. Styles: space-folder.css.
 */

const W = 340
const H = 272
const HEADROOM = 54 // room above the back panel for the pages to rise into
const FRONT_H = H - 74
const MAX_VISIBLE = 4

const BACK_PATH =
  "M0 56A22 22 0 0 1 22 34L146 34C170 34 172 0 198 0L318 0A22 22 0 0 1 340 22L340 250A22 22 0 0 1 318 272L22 272A22 22 0 0 1 0 250Z"
const FRONT_PATH = `M0 22A22 22 0 0 1 22 0L118 0C144 0 146 32 172 32L318 32A22 22 0 0 1 340 54L340 ${FRONT_H - 22}A22 22 0 0 1 318 ${FRONT_H}L22 ${FRONT_H}A22 22 0 0 1 0 ${FRONT_H - 22}Z`

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Where a page sits in the fan: -1 … 1 across the visible stack, 0 for one page. */
const fanSlot = (index: number, count: number) => (count <= 1 ? 0 : (index / (count - 1)) * 2 - 1)

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function SpaceFolder({
  space,
  width = 300,
  appearDelay = 0,
}: {
  space: SpaceRow
  width?: number
  appearDelay?: number
}) {
  const router = useRouter()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const filesRef = React.useRef<HTMLUListElement>(null)
  const hitRef = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const [entered, setEntered] = React.useState(false)
  const identity = SPACES.colors[space.color].hex
  const ink = readableInk(identity)
  const k = width / W

  // Assemble the first time it scrolls into view (straight away when motion is reduced).
  React.useEffect(() => {
    const el = rootRef.current
    if (!el || reducedMotion() || typeof IntersectionObserver === "undefined") {
      setEntered(true)
      return
    }
    let t = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        t = window.setTimeout(() => setEntered(true), appearDelay)
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      window.clearTimeout(t)
    }
  }, [appearDelay])

  // The light and a little parallax follow the pointer, without re-renders.
  React.useEffect(() => {
    const el = rootRef.current
    if (!el || reducedMotion()) return
    let raf = 0
    let px = 0
    let py = 0
    const write = () => {
      raf = 0
      el.style.setProperty("--gf-px", px.toFixed(3))
      el.style.setProperty("--gf-py", py.toFixed(3))
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return
      const r = el.getBoundingClientRect()
      px = ((e.clientX - r.left) / r.width) * 2 - 1
      py = ((e.clientY - r.top) / r.height) * 2 - 1
      if (!raf) raf = requestAnimationFrame(write)
    }
    const leave = () => {
      px = 0
      py = 0
      if (!raf) raf = requestAnimationFrame(write)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Closed pages are out of the tab order.
  React.useEffect(() => {
    filesRef.current?.toggleAttribute("inert", !open)
  }, [open])

  // Escape and a press outside close it.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      hitRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown)
    }
  }, [open])

  // The newest sit at the front of the stack, nearest the glass.
  const files = [...space.recent].reverse()
  const start = Math.max(0, files.length - MAX_VISIBLE)
  const visible = files.slice(start)
  const label = space.name.toLowerCase()
  const count = space.sources

  return (
    <div
      ref={rootRef}
      className="gf-root"
      data-open={open || undefined}
      data-entered={entered || undefined}
      style={
        {
          width,
          height: (H + HEADROOM) * k,
          "--gf-identity": identity,
          "--gf-ink": ink,
        } as React.CSSProperties
      }
    >
      <div className="gf-stage" style={{ transform: `translateY(${HEADROOM * k}px) scale(${k})` }}>
        <div className="gf-tilt">
          <div className="gf-shadow" aria-hidden="true" />

          {/* the back panel: the space's colour, holding its real cover */}
          <div className="gf-back" style={{ clipPath: `path('${BACK_PATH}')` }} aria-hidden="true">
            {space.cover ? (
              // biome-ignore lint/performance/noImgElement: same-origin webp thumbs, already sized
              <img
                className="gf-art"
                src={space.cover}
                alt=""
                width={W + 24}
                height={H + 24}
                draggable={false}
              />
            ) : null}
          </div>
          <svg className="gf-rim gf-back-rim" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <path d={BACK_PATH} />
          </svg>

          {/* the frosted front, hinged on its bottom edge */}
          <div className="gf-front" style={{ clipPath: `path('${FRONT_PATH}')` }}>
            <div className="gf-tint" aria-hidden="true" />
            <svg className="gf-rim gf-front-rim" viewBox={`0 0 ${W} ${FRONT_H}`} aria-hidden="true">
              <path d={FRONT_PATH} />
            </svg>
            <button
              ref={hitRef}
              type="button"
              className="gf-hit"
              aria-expanded={open}
              aria-label={`${open ? "Close" : "Open"} ${label}, ${count} source${count === 1 ? "" : "s"}`}
              onClick={() => {
                sound(open ? "tap" : "promote")
                setOpen(!open)
              }}
            />
            <div className="gf-label">
              <span className="gf-symbol" aria-hidden>{`${space.symbol}︎`}</span>
              <span className="gf-title">{label}</span>
              <span className="gf-meta">
                {count} source{count === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* the pages: after the glass in tab order, beneath it on screen */}
          <ul ref={filesRef} className="gf-files" aria-label={`${label}: newest sources`}>
            {visible.map((file, v) => {
              const slot = fanSlot(v, visible.length)
              const jitter = rng(hashString(file.id))
              return (
                <li key={file.id} className="gf-sheet-slot">
                  <button
                    type="button"
                    className={`gf-sheet${file.hasThumb ? " gf-sheet--page" : ""}`}
                    style={
                      {
                        "--gf-slot": slot,
                        "--gf-depth": visible.length - 1 - v,
                        "--gf-jx": `${((jitter() - 0.5) * 10).toFixed(2)}px`,
                        "--gf-jr": `${((jitter() - 0.5) * 3.2).toFixed(2)}deg`,
                        zIndex: v + 1,
                      } as React.CSSProperties
                    }
                    onClick={() => {
                      sound("tap")
                      openSource({
                        fileId: file.id,
                        title: file.title,
                        kind: file.kind as Parameters<typeof openSource>[0]["kind"],
                      })
                    }}
                  >
                    {file.hasThumb ? (
                      // biome-ignore lint/performance/noImgElement: same-origin webp thumbs, already sized
                      <img
                        className="gf-sheet-art"
                        src={`/api/files/${file.id}/thumb`}
                        alt=""
                        draggable={false}
                      />
                    ) : (
                      <span className="gf-lines" aria-hidden="true">
                        <i style={{ width: "86%" }} />
                        <i style={{ width: "92%" }} />
                        <i style={{ width: "64%" }} />
                        <i style={{ width: "88%" }} />
                      </span>
                    )}
                    <span className="gf-sheet-head">
                      <span className="gf-sheet-name">{file.title}</span>
                      <span className="gf-sheet-meta">
                        {KIND_LABEL[file.kind as keyof typeof KIND_LABEL] ?? file.kind}
                        {file.pageCount ? ` · ${file.pageCount} p` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* the key: into the space */}
          <Link
            href={`/spaces/${space.id}` as Route}
            className="gf-key"
            aria-label={`Go into ${label}`}
            onClick={() => sound("tap")}
            onMouseEnter={() => router.prefetch(`/spaces/${space.id}` as Route)}
          >
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
