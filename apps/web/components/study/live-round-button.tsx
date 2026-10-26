"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { ApiError, api } from "@/lib/fetcher"
import { sound } from "@/lib/sounds"
import { useQuery } from "@/lib/use-query"
import { useStudyActions } from "@/lib/use-study"

type ActiveRound = { code: string; title: string; phase: string; players: number } | null

/**
 * A space's way into study together: start a live round on its sources, or, while
 * one is going (someone started it), join it. The space's live events keep it current.
 */
export function LiveRoundButton({ spaceId, name }: { spaceId: string; name?: string }) {
  const router = useRouter()
  const study = useStudyActions()
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
      setBusy(false)
      // Not enough checked questions yet: the way forward is one tap, not a dead end.
      if (error instanceof ApiError && error.status === 409)
        return void toast("A round needs practice first", {
          description: "It plays this space's checked questions. Make some, then start it.",
          action: {
            label: "make practice",
            onClick: () =>
              void study.quizMe({ fileIds: [], folderIds: [spaceId] }, name, (href) =>
                router.push(href),
              ),
          },
        })
      toast.error((error as Error).message)
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
