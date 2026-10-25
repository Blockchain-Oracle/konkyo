"use client"

import { Button } from "@konkyo/ui/components/button"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { tiltFor } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import {
  BellRingIcon,
  BotIcon,
  CheckCheckIcon,
  FileSearchIcon,
  GraduationCapIcon,
  HeadphonesIcon,
  MailIcon,
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

/** What kind of slip it is, said on its black tag. */
const KIND = {
  review: "review",
  practice: "practice",
  "new-source": "found",
  "agent-run": "agent",
  brief: "brief",
  system: "notice",
  "held-mail": "mail",
} as const

const ICON = {
  review: GraduationCapIcon,
  practice: GraduationCapIcon,
  "new-source": FileSearchIcon,
  "agent-run": BotIcon,
  brief: HeadphonesIcon,
  system: BellRingIcon,
  "held-mail": MailIcon,
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
  // Mail to a space from someone outside it (F59): the owner adds its sources, or lets it go.
  const decide = async (add: boolean) => {
    try {
      await api(`/api/inbound/${item.data.inboundId}`, { method: "POST", json: { add } })
      void refresh()
      toast.success(add ? "Adding it to the space" : "Discarded", { description: item.title })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  const primary =
    item.kind === "held-mail" && item.data.inboundId
      ? { label: "Add to the space", run: () => decide(true) }
      : item.kind === "new-source" && !item.data.fileId && (item.data.doi || item.data.url)
        ? { label: "Import", run: importSource }
        : item.href
          ? {
              label:
                item.kind === "review"
                  ? "Start review"
                  : item.kind === "practice"
                    ? "Practise"
                    : item.kind === "brief"
                      ? "Listen"
                      : "Open",
              run: open,
            }
          : null

  // A slip of paper on the wall (OurSpaces' mail arrival): a black tag says what it is, a lime
  // sticker that it's new, and its one action is the lime one.
  return (
    <li
      className={cn("inbox-slip", !item.read && "is-new")}
      style={{ rotate: tiltFor(item.id, 760) }}
    >
      <div className="inbox-slip-top">
        <span className="inbox-tag">
          <Icon className="size-3.5" strokeWidth={2} aria-hidden />
          {KIND[item.kind] ?? "notice"}
        </span>
        {!item.read && <span className="inbox-new">new</span>}
        <span className="ml-auto text-[12px] font-bold text-ink-muted tabular-nums">
          {ago(item.createdAt)}
        </span>
        <button
          type="button"
          aria-label={`Dismiss ${item.title}`}
          onClick={() => void dismiss()}
          className="inbox-dismiss"
        >
          <XIcon className="size-3.5" strokeWidth={2.25} />
        </button>
      </div>
      <p className="inbox-title">{item.title}</p>
      {(item.body || item.data.detail) && (
        <p className="inbox-body">{item.data.detail ?? item.body}</p>
      )}
      {(primary || !item.read || item.kind === "held-mail") && (
        <div className="mt-3 flex items-center gap-3">
          {primary && (
            <button type="button" className="claim-done" onClick={() => void primary.run()}>
              {primary.label.toLowerCase()} <span aria-hidden="true">→</span>
            </button>
          )}
          {item.kind === "held-mail" && item.data.inboundId ? (
            <button
              type="button"
              className="text-[12.5px] font-bold text-ink-muted underline-offset-2 hover:underline"
              onClick={() => void decide(false)}
            >
              discard it
            </button>
          ) : (
            !item.read && (
              <button
                type="button"
                className="text-[12.5px] font-bold text-ink-muted underline-offset-2 hover:underline"
                onClick={() => void patch({ read: true })}
              >
                mark read
              </button>
            )
          )}
        </div>
      )}
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
      <div className="mb-6 flex items-center gap-2">
        <span className="room-pill">
          <b>{unread}</b> unread · {items.length} in all
        </span>
        <button
          type="button"
          className="room-pill hover:bg-ink disabled:opacity-50"
          disabled={!unread}
          onClick={() =>
            void api("/api/inbox/read-all", { method: "POST" }).then(() =>
              queryClient.invalidateQueries({ queryKey: inboxKeys.all }),
            )
          }
        >
          <CheckCheckIcon className="size-3.5" strokeWidth={2} />
          mark all read
        </button>
      </div>
      <ul className="inbox-slips">
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}
