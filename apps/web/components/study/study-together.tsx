"use client"

import { SPACES } from "@konkyo/config"
import { cn } from "@konkyo/ui/lib/utils"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { sound } from "@/lib/sounds"
import { useSpaceList } from "@/lib/use-spaces"
import { JoinWithCode } from "./live-round"

/**
 * Study together on the study board: start a live round from a space (or everything)
 * and share its code, or type someone else's code to walk into theirs.
 */
export function StudyTogether() {
  const router = useRouter()
  const { data: spaces } = useSpaceList()
  const [spaceId, setSpaceId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    try {
      const { code } = await api<{ code: string }>("/api/rounds", {
        method: "POST",
        json: spaceId ? { spaceId } : {},
      })
      sound("promote")
      router.push(`/study/live/${code}` as Route)
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }
  const chip =
    "inline-flex h-9 max-w-56 items-center gap-2 rounded-full border-2 border-white/80 px-3 text-[13px] font-bold transition-transform duration-(--dur-quick) hover:-translate-y-0.5"
  return (
    <section aria-labelledby="study-together" className="together-card">
      <div className="together-start">
        <p className="together-kicker">study together</p>
        <h2 id="study-together">a live round, with friends</h2>
        <p className="together-line">
          Everyone answers the same question at once, face down. Then the bars, the passage, and a
          score for the team.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={spaceId === null}
            onClick={() => setSpaceId(null)}
            className={cn(chip, spaceId === null ? "bg-white text-ink" : "text-white")}
          >
            everything
          </button>
          {spaces?.map((space) => (
            <button
              key={space.id}
              type="button"
              aria-pressed={spaceId === space.id}
              onClick={() => setSpaceId(space.id)}
              className={cn(chip, spaceId === space.id ? "bg-white text-ink" : "text-white")}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: SPACES.colors[space.color].hex }}
                aria-hidden
              />
              <span className="truncate">{space.name.toLowerCase()}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="claim-done mt-5"
          onClick={() => void start()}
          disabled={busy}
        >
          {busy ? "making the round…" : "start a live round →"}
        </button>
      </div>
      <JoinWithCode className="together-join" />
    </section>
  )
}
