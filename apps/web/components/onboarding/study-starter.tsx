"use client"

import { cn } from "@konkyo/ui/lib/utils"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useFiles } from "@/lib/use-library"
import { useStudyActions } from "@/lib/use-study"

/**
 * The Study starter's second half: while the sample course is read the folder says
 * so, and once every file has settled, Quiz me starts on what's ready, with no second click.
 */
export function StudyStarter({
  folderId,
  title,
  className,
}: {
  folderId: string
  title: string
  className?: string
}) {
  const [on, setOn] = useState(false)
  // Read once on the client: the starter link carries ?starter=study.
  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get("starter") === "study")
  }, [])
  const { data: files } = useFiles(folderId)
  const study = useStudyActions()
  const router = useRouter()
  const started = useRef(false)
  const ready = files?.filter((f) => f.status === "ready").length ?? 0
  const settled = files?.filter((f) => f.status === "ready" || f.status === "needs_you").length ?? 0
  const total = files?.length ?? 0
  const done = on && total > 0 && settled === total

  useEffect(() => {
    if (!done || started.current || !ready) return
    started.current = true
    void study.quizMe({ fileIds: [], folderIds: [folderId] }, title, (href) =>
      router.replace(href as Route),
    )
  }, [done, ready, folderId, title, study, router])

  if (!on || !total) return null
  return (
    <div className={cn("mt-6 rounded-card border border-border bg-panel p-4", className)}>
      <p className="text-ui text-bone-white">
        {done
          ? ready
            ? "Your sample course is read. Making your first quiz…"
            : "None of these could be read. Try again from Home."
          : `Reading your sample course · ${ready} of ${total} ready`}
      </p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-electric-iris/20" aria-hidden>
        <div
          className="h-full rounded-full bg-electric-iris transition-[width] duration-500"
          style={{ width: `${total ? (settled / total) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-3 text-meta text-ash-gray">
        Each file is read, split into passages and checked into Zetaris. The quiz starts by itself;
        each answer key is checked against its passage before you see it.
      </p>
    </div>
  )
}
