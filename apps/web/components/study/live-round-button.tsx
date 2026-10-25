"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { sound } from "@/lib/sounds"
import { useQuery } from "@/lib/use-query"

type ActiveRound = { code: string; title: string; phase: string; players: number } | null

/**
 * A space's way into study together (plan F58): start a live round on its sources, or, while
 * one is going (someone started it), join it. The space's live events keep it current.
 */
export function LiveRoundButton({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const { data } = useQuery({
    queryKey: ["space-round", spaceId],
    queryFn: () => api<{ round: ActiveRound }>(`/api/spaces/${spaceId}/round`),
  })
  const round = data?.round ?? null
  const go = async () => {
    sound("tap")
    if (round) return router.push(`/study/live/${round.code}` as Route)
    setBusy(true)
    try {
      const made = await api<{ code: string }>("/api/rounds", { method: "POST", json: { spaceId } })
      sound("promote")
      router.push(`/study/live/${made.code}` as Route)
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      className={round ? "live-round-button is-on" : "live-round-button"}
      onClick={() => void go()}
      disabled={busy}
      title={round ? `${round.players} in "${round.title}"` : "Start a live round on this space"}
    >
      {round ? (
        <>
          <i aria-hidden="true" /> live round · join
        </>
      ) : busy ? (
        "making it…"
      ) : (
        <>▶ live round</>
      )}
    </button>
  )
}
