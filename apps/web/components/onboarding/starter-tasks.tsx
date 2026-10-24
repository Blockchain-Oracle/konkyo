"use client"

import { cn } from "@konkyo/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { qk } from "@/lib/query-keys"

type Path = "study" | "research" | "write"
type Started =
  | { path: "study"; folderId: string }
  | { path: "research"; chatId: string }
  | { path: "write"; folderId: string; noteId: string }

const TASKS: {
  path: Path
  glyph: string
  title: string
  about: string
  meta: string
}[] = [
  {
    path: "study",
    glyph: "✎",
    title: "Study a sample course",
    about:
      "A psychology chapter on memory from OpenStax and an MIT lecture, then a quiz on them. Every answer key is checked against its passage.",
    meta: "5 open sources · quiz starts once they're read",
  },
  {
    path: "research",
    glyph: "◎",
    title: "Research a question",
    about:
      "“Does sleep help consolidate memories?” Konkyo searches open papers, imports them into a folder and answers with checked citations.",
    meta: "A real deep search · a minute or two",
  },
  {
    path: "write",
    glyph: "✦",
    title: "Start an essay",
    about:
      "Three open-access papers on sleep and learning beside an essay outline. Cite as you write; Check my draft marks what your sources don't support.",
    meta: "3 papers and a note",
  },
]

/**
 * The starter tasks (plan F39): one click runs each for real with openly licensed material. The
 * first run of Home leads with them; an empty library offers them again later.
 */
export function StarterTasks({ className }: { className?: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const start = useMutation({
    mutationFn: (path: Path) => api<Started>("/api/onboarding", { method: "POST", json: { path } }),
    onSuccess: (started) => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] })
      void queryClient.invalidateQueries({ queryKey: qk.files.all })
      const href =
        started.path === "study"
          ? `/library/folders/${started.folderId}?starter=study`
          : started.path === "research"
            ? `/chats/${started.chatId}?tour=1`
            : `/write/${started.noteId}`
      router.push(href as Route)
    },
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <ul className={cn("starter-slips", className)}>
      {TASKS.map((task) => {
        const starting = start.isPending && start.variables === task.path
        return (
          <li key={task.path}>
            <button
              type="button"
              onClick={() => start.mutate(task.path)}
              disabled={start.isPending}
              aria-busy={starting}
              className="starter-slip"
            >
              <span className="starter-slip-glyph" aria-hidden="true">
                {`${task.glyph}︎`}
              </span>
              <span className="starter-slip-body">
                <strong>{task.title}</strong>
                <span>{task.about}</span>
                <small>{starting ? "starting…" : task.meta}</small>
              </span>
              <span className="starter-slip-go" aria-hidden="true">
                →
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
