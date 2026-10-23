"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Spinner } from "@konkyo/ui/components/spinner"
import { cn } from "@konkyo/ui/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ChevronDownIcon,
  EllipsisIcon,
  GraduationCapIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  TelescopeIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import type { AgentView } from "@/lib/agents"
import { api } from "@/lib/fetcher"
import { focusOf } from "@/lib/focus"
import { AgentDialog, type AgentDraft, BLANK } from "./agent-dialog"

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

/** Ready-made agents for an empty page: the plan's own examples. */
const STARTERS: { label: string; draft: AgentDraft }[] = [
  {
    label: "Watch for new papers on a topic",
    draft: { ...BLANK, name: "New papers watch", kind: "watch" },
  },
  {
    label: "Quiz me every Monday",
    draft: {
      ...BLANK,
      name: "Monday quiz",
      kind: "quiz",
      schedule: { every: "week", weekday: 1, hour: 18 },
    },
  },
]

function AgentRow({ agent, onEdit }: { agent: AgentView; onEdit: () => void }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["agents"] })
  const running = agent.runs[0]?.status === "running"
  const last = agent.runs.find((r) => r.status !== "running")
  const Icon = agent.kind === "watch" ? TelescopeIcon : GraduationCapIcon
  const act = async (path: string, init: Parameters<typeof api>[1], done: string) => {
    try {
      await api(path, init)
      toast.success(done)
      void refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <li className="border-b border-border">
      <div className="flex items-start gap-3.5 py-4 pl-1">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-panel">
          <Icon className="size-4 text-silver-mist" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <p className="truncate text-ui text-bone-white">{agent.name}</p>
            {agent.status === "paused" && (
              <span className="rounded-full border border-border px-2 text-meta text-ash-gray">
                Paused
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-snippet text-ash-gray">
            {agent.kind === "watch" ? `Watching “${agent.instructions}”` : "Quiz from your sources"}{" "}
            · {agent.scheduleText}
          </p>
          <p className="mt-1.5 text-snippet text-silver-mist">
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner className="size-3" />
                Running now
              </span>
            ) : last ? (
              <>
                <span className={cn(last.status === "failed" && "text-saffron-spark")}>
                  {last.summary}
                </span>
                {last.via && (
                  <span className="text-ash-gray">
                    {" "}
                    · via{" "}
                    {last.via === "zetaris"
                      ? "Zetaris"
                      : last.via === "openalex"
                        ? "OpenAlex"
                        : "Tutor"}
                  </span>
                )}
              </>
            ) : (
              "No runs yet"
            )}
          </p>
          {agent.nextRunAt && (
            <p className="mt-0.5 text-meta text-ash-gray">Next run {when(agent.nextRunAt)}</p>
          )}
          {agent.runs.length > 0 && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="mt-2 inline-flex items-center gap-1 text-meta text-ash-gray hover:text-bone-white"
            >
              Run history
              <ChevronDownIcon
                className={cn("size-3.5 transition-transform", open && "rotate-180")}
                strokeWidth={1.5}
              />
            </button>
          )}
          {open && (
            <ol className="mt-2 space-y-1.5 border-l border-border pl-3">
              {agent.runs.map((r) => (
                <li key={r.id} className="text-meta">
                  <span className="text-ash-gray tabular-nums">{when(r.startedAt)}</span>
                  <span className="text-ash-gray">
                    {" "}
                    · {r.trigger === "manual" ? "run now" : "scheduled"} ·{" "}
                  </span>
                  <span
                    className={cn(
                      r.status === "failed" ? "text-saffron-spark" : "text-silver-mist",
                    )}
                  >
                    {r.status === "running" ? "running" : r.summary}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={running}
            onClick={() =>
              void act(`/api/agents/${agent.id}/run`, { method: "POST" }, "Running now")
            }
          >
            Run now
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${agent.name}`}>
                  <EllipsisIcon strokeWidth={1.5} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon strokeWidth={1.5} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void act(
                    `/api/agents/${agent.id}`,
                    {
                      method: "PATCH",
                      json: { status: agent.status === "active" ? "paused" : "active" },
                    },
                    agent.status === "active" ? "Paused" : "Resumed",
                  )
                }
              >
                {agent.status === "active" ? (
                  <PauseIcon strokeWidth={1.5} />
                ) : (
                  <PlayIcon strokeWidth={1.5} />
                )}
                {agent.status === "active" ? "Pause" : "Resume"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  void act(
                    `/api/agents/${agent.id}`,
                    { method: "DELETE" },
                    `Deleted “${agent.name}”`,
                  )
                }
              >
                <Trash2Icon strokeWidth={1.5} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}

/** Agents (plan F34): standing tasks with their schedule, last result and run history. */
export function AgentsView() {
  const router = useRouter()
  const params = useSearchParams()
  const { data: agents, isPending } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<{ agents: AgentView[] }>("/api/agents").then((r) => r.agents),
    refetchInterval: (q) =>
      q.state.data?.some((a) => a.runs[0]?.status === "running") ? 2_000 : 30_000,
  })
  const [dialog, setDialog] = useState<{
    draft: AgentDraft
    editing?: AgentView
    key: number
  } | null>(null)
  // Create → Agent lands here with ?new=1.
  useEffect(() => {
    if (params.get("new")) {
      setDialog({ draft: BLANK, key: Date.now() })
      router.replace("/agents")
    }
  }, [params, router])
  const openNew = (draft: AgentDraft = BLANK) => setDialog({ draft, key: Date.now() })

  return (
    <>
      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !agents?.length ? (
        <EmptyState
          label="Agents"
          title="No agents yet"
          description="Agents run standing tasks for you and report to your Inbox: watching for new papers on a topic, or quizzing you every Monday."
        >
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <Button key={s.label} variant="secondary" onClick={() => openNew(s.draft)}>
                {s.draft.kind === "watch" ? (
                  <TelescopeIcon strokeWidth={1.5} />
                ) : (
                  <GraduationCapIcon strokeWidth={1.5} />
                )}
                {s.label}
              </Button>
            ))}
          </div>
        </EmptyState>
      ) : (
        <section aria-label="Your agents">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <p className="text-snippet text-ash-gray">
              {agents.length} {agents.length === 1 ? "agent" : "agents"} ·{" "}
              {agents.filter((a) => a.status === "active").length} active
            </p>
            <Button size="sm" onClick={() => openNew()}>
              <PlusIcon strokeWidth={1.75} />
              New agent
            </Button>
          </div>
          <ul>
            {agents.map((a) => (
              <AgentRow
                key={a.id}
                agent={a}
                onEdit={() =>
                  setDialog({
                    draft: {
                      name: a.name,
                      kind: a.kind,
                      instructions: a.instructions,
                      scope: focusOf(a.scope),
                      schedule: a.schedule,
                    },
                    editing: a,
                    key: Date.now(),
                  })
                }
              />
            ))}
          </ul>
        </section>
      )}
      {dialog && (
        <AgentDialog
          key={dialog.key}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          initial={dialog.draft}
          editing={dialog.editing}
        />
      )}
    </>
  )
}
