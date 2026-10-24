"use client"

import { cn } from "@konkyo/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRightIcon, GraduationCapIcon, NotebookPenIcon, TelescopeIcon } from "lucide-react"
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
  icon: typeof GraduationCapIcon
  title: string
  about: string
  meta: string
}[] = [
  {
    path: "study",
    icon: GraduationCapIcon,
    title: "Study a sample course",
    about:
      "A psychology chapter on memory from OpenStax and an MIT lecture, then a quiz on them. Every answer key is checked against its passage.",
    meta: "5 open sources · quiz starts once they're read",
  },
  {
    path: "research",
    icon: TelescopeIcon,
    title: "Research a question",
    about:
      "“Does sleep help consolidate memories?” Konkyo searches open papers, imports them into a folder and answers with checked citations.",
    meta: "A real deep search · a minute or two",
  },
  {
    path: "write",
    icon: NotebookPenIcon,
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
    <ul className={cn("space-y-2.5", className)}>
      {TASKS.map((task) => {
        const Icon = task.icon
        const starting = start.isPending && start.variables === task.path
        return (
          <li key={task.path}>
            <button
              type="button"
              onClick={() => start.mutate(task.path)}
              disabled={start.isPending}
              aria-busy={starting}
              className="group flex w-full items-start gap-4 rounded-card border border-border bg-panel p-4.5 text-left transition-colors duration-(--duration-press) hover:border-line-strong hover:bg-raised disabled:opacity-60 disabled:hover:bg-accent"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-raised">
                <Icon className="size-4 text-silver-mist" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ui text-bone-white">{task.title}</span>
                <span className="mt-1 block text-snippet text-pretty text-silver-mist">
                  {task.about}
                </span>
                <span className="mt-2 block text-meta text-ash-gray">
                  {starting ? "Starting…" : task.meta}
                </span>
              </span>
              <ArrowRightIcon
                className="mt-2 size-4 shrink-0 text-ash-gray transition-transform duration-(--duration-press) group-hover:translate-x-0.5 group-hover:text-bone-white"
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
