"use client"

import { cn } from "@konkyo/ui/lib/utils"
import { useEffect, useState } from "react"
import { useLiveStatus } from "@/lib/use-status"
import { useDockVisible } from "./dock"

/** "3m ago" from an ISO time, refreshed by the caller's tick. */
function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

/**
 * The live pill, bottom left (plan §16.6, OurSpaces' "live sync · connected for everyone"): what
 * Konkyo is doing for you right now, from real rows. Desktop only.
 */
export function StatusPill() {
  // Pages with their own ask box at the bottom (a chat, the editor) keep that corner clear.
  const visible = useDockVisible()
  const { data } = useLiveStatus()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  if (!data || !visible) return null
  const busy = data.reading > 0 || data.working > 0
  const parts = [
    data.reading ? `${data.reading} reading` : null,
    data.working ? `${data.working} working` : null,
    !busy && data.lastAnsweredAt ? `last check ${ago(data.lastAnsweredAt, now)}` : null,
    !busy && !data.lastAnsweredAt ? "all quiet" : null,
  ].filter(Boolean)
  return (
    <div
      role="status"
      className="status-pill pointer-events-none fixed bottom-5 left-[118px] z-30 hidden items-center gap-2 rounded-full bg-sticker px-3.5 py-2 text-meta font-semibold text-white shadow-sticker xl:flex"
    >
      <span className={cn("size-2 rounded-full bg-lime", busy && "animate-blink")} aria-hidden />
      live
      <span className="text-room-muted">· {parts.join(" · ")}</span>
    </div>
  )
}
