"use client"

import { Button } from "@konkyo/ui/components/button"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { cn } from "@konkyo/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import {
  BellRingIcon,
  BotIcon,
  CheckCheckIcon,
  FileSearchIcon,
  GraduationCapIcon,
  XIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { api } from "@/lib/fetcher"
import type { InboxItem } from "@/lib/inbox"
import { inboxKeys, useInbox } from "@/lib/use-inbox"

const ICON = {
  review: GraduationCapIcon,
  practice: GraduationCapIcon,
  "new-source": FileSearchIcon,
  "agent-run": BotIcon,
  system: BellRingIcon,
} as const

/** "2m", "3h", "Tue", "3 Nov": how long ago, as Linear's inbox says it. */
function ago(iso: string) {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  if (hours < 24 * 6) return then.toLocaleDateString(undefined, { weekday: "short" })
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

function Row({ item }: { item: InboxItem }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const Icon = ICON[item.kind] ?? BellRingIcon
  const refresh = () => queryClient.invalidateQueries({ queryKey: inboxKeys.all })
  const patch = (body: { read?: boolean; dismissed?: boolean }) =>
    api(`/api/inbox/${item.id}`, { method: "PATCH", json: body }).then(refresh)

  const open = () => {
    if (!item.read) void patch({ read: true })
    if (item.href) router.push(item.href as Route)
  }
  const dismiss = async () => {
    await patch({ dismissed: true })
    toast.success("Dismissed", {
      action: { label: "Undo", onClick: () => void patch({ dismissed: false }) },
    })
  }
  const importSource = async () => {
    const url = item.data.doi ? `https://doi.org/${item.data.doi}` : item.data.url
    if (!url) return
    try {
      await api("/api/files/import", { method: "POST", json: { url } })
      await patch({ read: true })
      toast.success("Importing it into your library", { description: item.title })
      void queryClient.invalidateQueries({ queryKey: ["files"] })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  const primary =
    item.kind === "new-source" && !item.data.fileId && (item.data.doi || item.data.url)
      ? { label: "Import", run: importSource }
      : item.href
        ? {
            label:
              item.kind === "review"
                ? "Start review"
                : item.kind === "practice"
                  ? "Practise"
                  : "Open",
            run: open,
          }
        : null

  return (
    <li className="group relative flex gap-3.5 border-b border-border py-4 pr-1 pl-1">
      <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-panel">
        <Icon className="size-4 text-silver-mist" strokeWidth={1.5} aria-hidden />
        {!item.read && (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-electric-iris">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-ui",
              item.read ? "text-silver-mist" : "text-bone-white",
            )}
          >
            {item.title}
          </p>
          <span className="shrink-0 text-meta text-ash-gray tabular-nums">
            {ago(item.createdAt)}
          </span>
        </div>
        {(item.body || item.data.detail) && (
          <p className="mt-0.5 line-clamp-2 text-snippet text-ash-gray">
            {item.data.detail ?? item.body}
          </p>
        )}
        <div className="mt-2.5 flex items-center gap-1.5">
          {primary && (
            <Button size="sm" variant="secondary" onClick={() => void primary.run()}>
              {primary.label}
            </Button>
          )}
          {!item.read && (
            <Button
              size="sm"
              variant="ghost"
              className="text-ash-gray"
              onClick={() => void patch({ read: true })}
            >
              Mark read
            </Button>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Dismiss ${item.title}`}
        onClick={() => void dismiss()}
        className="text-ash-gray opacity-100 hover:text-bone-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      >
        <XIcon strokeWidth={1.5} />
      </Button>
    </li>
  )
}

/**
 * The Inbox (plan F41, Linear's pattern): review reminders, sources a watch found, finished agent
 * runs. Each row has its action in place: Import, Open or Start review, and Dismiss.
 */
export function InboxView() {
  const { data: items, isPending } = useInbox()
  const queryClient = useQueryClient()
  if (isPending)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  if (!items?.length)
    return (
      <EmptyState
        label="Inbox"
        title="Nothing new"
        description="Review reminders, sources your watches find and finished agent runs arrive here. Turn on notifications to get them on this device too."
      >
        <Button
          render={<Link href="/settings#notifications" />}
          nativeButton={false}
          variant="secondary"
        >
          Notification settings
        </Button>
      </EmptyState>
    )
  const unread = items.filter((i) => !i.read).length
  return (
    <section aria-label="Inbox">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <p className="text-snippet text-ash-gray">
          {unread ? `${unread} unread` : "All read"} · {items.length} in all
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={!unread}
          onClick={() =>
            void api("/api/inbox/read-all", { method: "POST" }).then(() =>
              queryClient.invalidateQueries({ queryKey: inboxKeys.all }),
            )
          }
        >
          <CheckCheckIcon strokeWidth={1.5} />
          Mark all read
        </Button>
      </div>
      <ul>
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}
