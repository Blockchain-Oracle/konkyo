"use client"

import { type ComponentType, useEffect, useEffectEvent, useRef, useState } from "react"
import type { PublicShare } from "@/components/public/public-folder"
import { ASK_EVENT, CITE_EVENT, type LandingCite } from "./ask-event"
import type { LiveAnswer } from "./live-answer"
import { AskForm } from "./live-answer-parts"

type Live = typeof LiveAnswer extends ComponentType<infer P> ? ComponentType<P> : never

let loading: Promise<Live> | null = null
const loadLive = () => {
  loading ??= import("./live-answer").then((m) => m.LiveAnswer)
  loading.catch(() => {
    loading = null
  })
  return loading
}

/**
 * The landing's live demo, light until it's needed: the box and suggestions are plain markup at
 * first, and the chat code (the AI SDK, about 90 kB) loads when the section comes near, the box
 * is focused, or a question is asked here or from the board above. Whatever was typed or asked
 * meanwhile is handed over, so nothing is lost and nothing moves.
 */
export function LazyLiveAnswer({ slug, share }: { slug: string; share: PublicShare }) {
  const [Live, setLive] = useState<Live | null>(null)
  const [text, setText] = useState("")
  const [first, setFirst] = useState<string | null>(null)
  const [cite, setCite] = useState<LandingCite | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const load = useEffectEvent(() => {
    void loadLive().then((C) => setLive(() => C))
  })
  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    setFirst(q)
    load()
  }
  // Once the chat is here it hears the board itself.
  const onAsk = useEffectEvent((e: Event) => {
    if (!Live) ask((e as CustomEvent<string>).detail)
  })
  const onCite = useEffectEvent((e: Event) => {
    if (Live) return
    setCite((e as CustomEvent<LandingCite>).detail)
    load()
  })
  useEffect(() => {
    window.addEventListener(ASK_EVENT, onAsk)
    window.addEventListener(CITE_EVENT, onCite)
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen.disconnect()
          load()
        }
      },
      { rootMargin: "600px 0px" },
    )
    if (box.current) seen.observe(box.current)
    return () => {
      window.removeEventListener(ASK_EVENT, onAsk)
      window.removeEventListener(CITE_EVENT, onCite)
      seen.disconnect()
    }
  }, [])

  // A question asked before the chat arrived is handed over the way the board asks: the same
  // event, once the chat is listening (a mount-time send is lost to React's dev double mount).
  useEffect(() => {
    if (!Live || !first) return
    const hand = setTimeout(() =>
      window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: first })),
    )
    return () => clearTimeout(hand)
  }, [Live, first])

  // A citation clicked on the board before the chat arrived is handed over the same way.
  useEffect(() => {
    if (!Live || !cite) return
    const hand = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(CITE_EVENT, { detail: cite }))
      setCite(null)
    })
    return () => clearTimeout(hand)
  }, [Live, cite])

  if (Live) return <Live slug={slug} share={share} draft={first ? "" : text} />
  return (
    <div ref={box} className="p-5 sm:p-8">
      <AskForm
        slug={slug}
        share={share}
        text={text}
        onText={setText}
        onAsk={ask}
        onFocus={load}
        running={first !== null}
      />
      {first && (
        <div className="mt-7 border-t border-border pt-6" aria-live="polite">
          <p className="font-display text-[20px] leading-snug font-bold tracking-[-0.02em] text-ink">
            {first}
          </p>
          <p className="mt-4 animate-checking text-snippet text-ash-gray">Starting…</p>
        </div>
      )}
    </div>
  )
}
