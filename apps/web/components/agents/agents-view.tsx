"use client"

import { SPACES } from "@konkyo/config"
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
import { readableInk } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
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
import { type CSSProperties, useEffect, useState } from "react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import type { AgentView } from "@/lib/agents"
import { api } from "@/lib/fetcher"
import { focusOf } from "@/lib/focus"
import { useQuery } from "@/lib/use-query"
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
  const color = SPACES.colors[agent.kind === "watch" ? "cobalt" : "orange"].hex
  return (
    <li
      className={cn("agent-card", agent.status === "paused" && "is-paused")}
      style={{ "--agent": color, "--agent-ink": readableInk(color) } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span className="agent-icon" aria-hidden>
          <Icon className="size-4.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="agent-name">{agent.name}</p>
          <p className="agent-what">
            {agent.kind === "watch"
              ? `watching “${agent.instructions}”`
              : "a quiz from your sources"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button type="button" className="agent-more" aria-label={`More for ${agent.name}`}>
                <EllipsisIcon className="size-4" strokeWidth={2.25} />
              </button>
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
                void act(`/api/agents/${agent.id}`, { method: "DELETE" }, `Deleted “${agent.name}”`)
              }
            >
              <Trash2Icon strokeWidth={1.5} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* the last result, on a slip of paper */}
      <div className="agent-slip">
        {running ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3" />
            running now
          </span>
        ) : last ? (
          <>
            <span className={cn(last.status === "failed" && "text-[#b8401a]")}>{last.summary}</span>
            {last.via && (
              <small>
                {" "}
                · via{" "}
                {last.via === "zetaris"
                  ? "Zetaris"
                  : last.via === "openalex"
                    ? "OpenAlex"
                    : "Tutor"}
              </small>
            )}
          </>
        ) : (
          "no runs yet"
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <span className="agent-pill">
          {agent.status === "paused"
            ? "paused"
            : agent.nextRunAt
              ? `next ${when(agent.nextRunAt)}`
              : agent.scheduleText}
        </span>
        <button
          type="button"
          className="agent-run"
          disabled={running}
          onClick={() => void act(`/api/agents/${agent.id}/run`, { method: "POST" }, "Running now")}
        >
          <PlayIcon className="size-3.5 fill-current" strokeWidth={0} />
          run now
        </button>
      </div>

      {agent.runs.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="agent-history-toggle"
        >
          run history
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
            strokeWidth={2}
          />
        </button>
      )}
      {open && (
        <ol className="agent-history">
          {agent.runs.map((r) => (
            <li key={r.id}>
              <span className="tabular-nums">{when(r.startedAt)}</span> ·{" "}
              {r.trigger === "manual" ? "run now" : "scheduled"} ·{" "}
              <b className={cn(r.status === "failed" && "text-[#b8401a]")}>
                {r.status === "running" ? "running" : r.summary}
              </b>
            </li>
          ))}
        </ol>
      )}
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
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="room-pill">
              <b>{agents.length}</b> {agents.length === 1 ? "agent" : "agents"} ·{" "}
              {agents.filter((a) => a.status === "active").length} active
            </span>
            <button type="button" className="claim-done ml-auto" onClick={() => openNew()}>
              <PlusIcon className="size-4" strokeWidth={2.5} />
              new agent
            </button>
          </div>
          <ul className="agents-grid">
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
