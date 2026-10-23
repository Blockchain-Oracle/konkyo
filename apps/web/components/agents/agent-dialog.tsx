"use client"

import type { AgentKind, AgentSchedule } from "@konkyo/db/schema"
import { nextRunAt } from "@konkyo/jobs/schedule"
import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { Input } from "@konkyo/ui/components/input"
import { Spinner } from "@konkyo/ui/components/spinner"
import { cn } from "@konkyo/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { GraduationCapIcon, PlusIcon, TelescopeIcon, XIcon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { FocusIcon, FocusPicker } from "@/components/chat/focus-picker"
import type { AgentView } from "@/lib/agents"
import { api } from "@/lib/fetcher"
import { type Focus, toggleFocus, useFocusItems, WHOLE_LIBRARY } from "@/lib/focus"

export type AgentDraft = {
  name: string
  kind: AgentKind
  instructions: string
  scope: Focus
  schedule: AgentSchedule
}

export const BLANK: AgentDraft = {
  name: "",
  kind: "watch",
  instructions: "",
  scope: WHOLE_LIBRARY,
  schedule: { every: "day", hour: 8 },
}

const KINDS: { kind: AgentKind; label: string; about: string; icon: typeof TelescopeIcon }[] = [
  {
    kind: "watch",
    label: "Watch for new papers",
    about: "New open-access papers on a topic, in your Inbox with Import.",
    icon: TelescopeIcon,
  },
  {
    kind: "quiz",
    label: "Quiz me on a schedule",
    about: "Fresh practice from a folder, checked against your sources.",
    icon: GraduationCapIcon,
  },
]
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`
const HOURS = Array.from({ length: 24 }, (_, h) => h)

const selectClass =
  "h-9 rounded-lg border border-border bg-raised px-2.5 text-ui text-bone-white outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Create → Agent (plan F34, Perplexity's scheduled task): four fields, the schedule in one row. */
export function AgentDialog({
  open,
  onOpenChange,
  initial,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: AgentDraft
  editing?: AgentView
}) {
  const queryClient = useQueryClient()
  const items = useFocusItems()
  const [draft, setDraft] = useState<AgentDraft>(initial)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const nameId = useId()
  const topicId = useId()
  const patch = (next: Partial<AgentDraft>) => setDraft((d) => ({ ...d, ...next }))
  const chosen = useMemo(
    () =>
      items.filter((i) =>
        (i.type === "file" ? draft.scope.fileIds : draft.scope.folderIds).includes(i.id),
      ),
    [items, draft.scope],
  )
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const next = nextRunAt(draft.schedule, zone)
  const nextText = next.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const ready =
    draft.name.trim() &&
    (draft.kind === "watch"
      ? draft.instructions.trim().length >= 3
      : draft.scope.fileIds.length + draft.scope.folderIds.length > 0)

  const save = async () => {
    setSaving(true)
    try {
      const body = { ...draft, scope: draft.scope }
      if (editing)
        await api(`/api/agents/${editing.id}`, {
          method: "PATCH",
          json: {
            name: body.name,
            instructions: body.instructions,
            scope: body.scope,
            schedule: body.schedule,
          },
        })
      else await api("/api/agents", { method: "POST", json: body })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      toast.success(editing ? "Agent saved" : "Agent created", {
        description: editing
          ? undefined
          : "Its first run has started; results arrive in your Inbox.",
      })
      onOpenChange(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit agent" : "New agent"}</DialogTitle>
          <DialogDescription>
            A standing task that runs on its own and reports to your Inbox.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-snippet text-silver-mist">
              Name
            </label>
            <Input
              id={nameId}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={draft.kind === "watch" ? "Sleep research watch" : "Monday quiz"}
              maxLength={120}
            />
          </div>

          {!editing && (
            <div className="space-y-1.5">
              <p className="text-snippet text-silver-mist">What it does</p>
              <div
                role="radiogroup"
                aria-label="What it does"
                className="grid gap-2 sm:grid-cols-2"
              >
                {KINDS.map((k) => (
                  // biome-ignore lint/a11y/useSemanticElements: cards, not native radios
                  <button
                    key={k.kind}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === k.kind}
                    onClick={() => patch({ kind: k.kind })}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors duration-(--duration-press)",
                      draft.kind === k.kind
                        ? "border-bone-white/60 bg-white/5"
                        : "border-border hover:border-white/24",
                    )}
                  >
                    <k.icon className="size-4 text-silver-mist" strokeWidth={1.5} />
                    <span className="text-ui text-bone-white">{k.label}</span>
                    <span className="text-meta text-ash-gray">{k.about}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {draft.kind === "watch" ? (
            <div className="space-y-1.5">
              <label htmlFor={topicId} className="text-snippet text-silver-mist">
                Watch for
              </label>
              <Input
                id={topicId}
                value={draft.instructions}
                onChange={(e) => patch({ instructions: e.target.value })}
                placeholder="sleep and memory consolidation"
                maxLength={300}
              />
              <p className="text-meta text-ash-gray">
                Searched in OpenAlex through a Zetaris table; papers you already have are skipped.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-snippet text-silver-mist">Quiz me on</p>
              <div className="flex flex-wrap items-center gap-2">
                {chosen.map((item) => (
                  <span
                    key={`${item.type}:${item.id}`}
                    className="inline-flex h-8 max-w-60 items-center gap-1.5 rounded-full border border-border bg-panel pr-1 pl-2.5 text-snippet text-bone-white"
                  >
                    <FocusIcon item={item} />
                    <span className="truncate">{item.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => patch({ scope: toggleFocus(draft.scope, item) })}
                      className="flex size-6 items-center justify-center rounded-full text-ash-gray hover:bg-white/8 hover:text-bone-white"
                    >
                      <XIcon className="size-3" strokeWidth={1.75} />
                    </button>
                  </span>
                ))}
                <FocusPicker
                  items={items.filter((i) => i.type === "folder" || i.kind !== "note")}
                  focus={draft.scope}
                  onChange={(scope) => patch({ scope })}
                  open={picking}
                  onOpenChange={setPicking}
                  side="bottom"
                  trigger={
                    <Button variant="secondary" size="sm">
                      <PlusIcon strokeWidth={1.5} />
                      {chosen.length ? "Add" : "Choose a folder or files"}
                    </Button>
                  }
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-snippet text-silver-mist">When</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="How often"
                value={draft.schedule.every}
                onChange={(e) =>
                  patch({
                    schedule: {
                      ...draft.schedule,
                      every: e.target.value as "day" | "week",
                      weekday:
                        e.target.value === "week" ? (draft.schedule.weekday ?? 1) : undefined,
                    },
                  })
                }
                className={selectClass}
              >
                <option value="day">Every day</option>
                <option value="week">Every week</option>
              </select>
              {draft.schedule.every === "week" && (
                <select
                  aria-label="Day"
                  value={draft.schedule.weekday ?? 1}
                  onChange={(e) =>
                    patch({ schedule: { ...draft.schedule, weekday: Number(e.target.value) } })
                  }
                  className={selectClass}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      on {d}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Time"
                value={draft.schedule.hour}
                onChange={(e) =>
                  patch({ schedule: { ...draft.schedule, hour: Number(e.target.value) } })
                }
                className={selectClass}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    at {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-meta text-ash-gray">
              Next run {nextText}
              {editing ? "" : ", and once right now"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!ready || saving}>
            {saving && <Spinner />}
            {editing ? "Save" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
