"use client"

import type { StudyMode } from "@konkyo/db/schema"
import { useSearchParams } from "next/navigation"
import { StudySession } from "@/components/study/session"

const MODES: StudyMode[] = ["quiz", "review", "recall", "fix", "evidence", "order", "compare"]

export function SessionFromParams() {
  const params = useSearchParams()
  const mode = MODES.find((m) => m === params.get("mode")) ?? "review"
  const setId = params.get("set") ?? undefined
  const ids = params.get("ids")?.split(",").filter(Boolean)
  // A new round (Another round, Try the ones you missed) starts from a clean slate.
  return <StudySession key={params.toString()} mode={mode} setId={setId} ids={ids} />
}
