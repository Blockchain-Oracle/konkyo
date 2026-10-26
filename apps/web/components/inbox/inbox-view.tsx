"use client"

import type { FileKind } from "@konkyo/config"
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
import { useState } from "react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { api } from "@/lib/fetcher"
import type { InboxItem } from "@/lib/inbox"
import { openSource } from "@/lib/preview"
import { inboxKeys, useInbox } from "@/lib/use-inbox"
import { sessionHref, useToday } from "@/lib/use-study"

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
  const [deciding, setDeciding] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const decide = async (add: boolean) => {
    if (deciding) return
    setDeciding(true)
    try {
      await api(`/api/inbound/${item.data.inboundId}`, { method: "POST", json: { add } })
      void refresh()
      toast.success(add ? "Adding it to the space" : "Discarded", { description: item.title })
    } catch (error) {
      toast.error((error as Error).message)
      setDeciding(false)
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

  // A slip of paper on the wall: a black tag says what it is, a lime
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
      {item.data.stance && <StanceLine stance={item.data.stance} />}
      {(primary || !item.read || item.kind === "held-mail") && (
        <div className="mt-3 flex items-center gap-3">
          {primary && (
            <button
              type="button"
              className="claim-done"
              disabled={deciding}
              onClick={() => void primary.run()}
            >
              {primary.label.toLowerCase()} <span aria-hidden="true">→</span>
            </button>
          )}
          {item.kind === "held-mail" && item.data.inboundId ? (
            <button
              type="button"
              className="text-[12.5px] font-bold text-ink-muted underline-offset-2 hover:underline"
              // the mail can't be brought back: a second tap says so first
              onClick={() => (discarding ? void decide(false) : setDiscarding(true))}
              onBlur={() => setDiscarding(false)}
            >
              {discarding ? "discard for good?" : "discard it"}
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
  // Practice waiting is worth saying even when nothing new has arrived.
  const due = useToday().data?.due ?? 0
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
        title={due ? `${due} to practise today` : "Nothing new"}
        description={
          due
            ? "Nothing new has arrived, but practice is waiting. Review reminders, sources your watches find and finished agent runs arrive here."
            : "Review reminders, sources your watches find and finished agent runs arrive here. Turn on notifications to get them on this device too."
        }
      >
        <div className="flex flex-wrap gap-2">
          {due > 0 && (
            <Button render={<Link href={sessionHref({ mode: "review" })} />} nativeButton={false}>
              Start review
            </Button>
          )}
          <Button
            render={<Link href={"/agents?new=watch" as Route} />}
            nativeButton={false}
            variant="secondary"
          >
            Watch for new papers
          </Button>
          <Button
            render={<Link href="/settings#notifications" />}
            nativeButton={false}
            variant="ghost"
          >
            Notification settings
          </Button>
        </div>
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

/** A claim read inside a sentence: no full stop, and lower case unless it opens with an acronym. */
const midSentence = (claim: string) => {
  const text = claim.trim().replace(/\.$/, "")
  return /^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * Where a watch's new paper stands against your own sources: it agrees or disagrees with one of
 * them (your passage quoted, and one tap opens it there), or it's new to your library.
 */
function StanceLine({ stance }: { stance: NonNullable<InboxItem["data"]["stance"]> }) {
  if (stance.stance === "new" || !stance.fileId)
    return (
      <p className="mt-2 text-[13px] text-ink-muted">
        <b className="text-ink">new to your library</b> · {stance.claim}
      </p>
    )
  const agrees = stance.stance === "agrees"
  const fileId = stance.fileId
  return (
    <div className="mt-2 text-[13px] text-ink-muted">
      <p>
        <b className={agrees ? "text-supports-text" : "text-contradicts"}>
          {agrees ? "agrees with" : "disagrees with"}
        </b>{" "}
        your <i>{stance.title}</i> on {midSentence(stance.claim)}
      </p>
      <button
        type="button"
        className="mt-1 text-left underline-offset-2 hover:underline"
        onClick={() =>
          openSource({
            fileId,
            title: stance.title ?? "Source",
            kind: (stance.kind ?? "pdf") as FileKind,
            passageId: stance.passageId,
            page: stance.page ?? undefined,
            quote: stance.quote,
          })
        }
      >
        “{stance.quote}”{stance.page != null ? ` · p. ${stance.page}` : ""}{" "}
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  )
}
