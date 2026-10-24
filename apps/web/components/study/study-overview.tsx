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
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowRightIcon,
  EllipsisIcon,
  FolderIcon,
  LibraryBigIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { FocusIcon, FocusPicker } from "@/components/chat/focus-picker"
import { api } from "@/lib/fetcher"
import { type Focus, isWholeLibrary, toggleFocus, useFocusItems, WHOLE_LIBRARY } from "@/lib/focus"
import type { SetSummary } from "@/lib/study"
import { sessionHref, studyKeys, useQuizMe, useSets } from "@/lib/use-study"

/** The five games (plan F30), each built from the same verified items. */
export const GAMES = [
  {
    mode: "recall",
    name: "Recall Sprint",
    about: "Short answers and fill-in-the-blanks. Typing it beats recognising it.",
    kinds: ["recall", "cloze"],
  },
  {
    mode: "fix",
    name: "Fix the False Statement",
    about: "True or false, then rewrite the false ones. The source's own sentence follows.",
    kinds: ["truefalse"],
  },
  {
    mode: "evidence",
    name: "Find the Evidence",
    about:
      "Which passage says this? The other options are real, similar passages from your library.",
    // Counted by the server: recall items and true statements (lib/study.ts `asksEvidence`).
    kinds: ["evidence"],
  },
  {
    mode: "order",
    name: "Order the Steps",
    about: "Put a real sequence back in order: stages, methods, mechanisms.",
    kinds: ["order"],
  },
  {
    mode: "compare",
    name: "Compare the Sources",
    about: "Do two of your sources agree or disagree? Then point to where each says so.",
    kinds: ["compare"],
  },
] as const

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Make practice (F27): pick files or folders, Quiz me. */
export function MakePractice() {
  const items = useFocusItems()
  const quizMe = useQuizMe()
  const router = useRouter()
  const [focus, setFocus] = useState<Focus>(WHOLE_LIBRARY)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const chosen = useMemo(
    () => items.filter((i) => (i.type === "file" ? focus.fileIds : focus.folderIds).includes(i.id)),
    [items, focus],
  )
  const start = async () => {
    setBusy(true)
    try {
      router.push(await quizMe(focus))
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby="make-practice">
      <h2 id="make-practice" className="text-micro text-saffron-spark uppercase">
        Make practice
      </h2>
      <p className="mt-3 max-w-xl text-reading text-ash-gray">
        From any file or folder. Every answer key is checked against its passage before you see it,
        and you answer first.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {chosen.map((item) => (
          <span
            key={`${item.type}:${item.id}`}
            className="inline-flex h-8 max-w-64 items-center gap-1.5 rounded-full border border-border bg-panel pr-1 pl-2.5 text-snippet text-bone-white"
          >
            <FocusIcon item={item} />
            <span className="truncate">{item.name}</span>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => setFocus(toggleFocus(focus, item))}
              className="flex size-6 items-center justify-center rounded-full text-ash-gray hover:bg-white/8 hover:text-bone-white"
            >
              <XIcon className="size-3" strokeWidth={1.75} />
            </button>
          </span>
        ))}
        <FocusPicker
          items={items}
          focus={focus}
          onChange={setFocus}
          open={open}
          onOpenChange={setOpen}
          side="bottom"
          trigger={
            <Button variant="secondary" size="lg">
              {isWholeLibrary(focus) ? (
                <>
                  <LibraryBigIcon strokeWidth={1.5} />
                  Whole library
                </>
              ) : (
                <>
                  <PlusIcon strokeWidth={1.5} />
                  Add
                </>
              )}
            </Button>
          }
        />
        <Button size="lg" onClick={() => void start()} disabled={busy}>
          {busy ? <Spinner /> : null}
          Quiz me
        </Button>
      </div>
    </section>
  )
}

/** The five games, with how many items each has to play with. */
export function Games() {
  const { data: sets } = useSets()
  const counts = useMemo(() => {
    const byKind: Record<string, number> = {}
    for (const s of sets ?? [])
      for (const [kind, n] of Object.entries(s.kinds)) byKind[kind] = (byKind[kind] ?? 0) + n
    return Object.fromEntries(
      GAMES.map((g) => [g.mode, g.kinds.reduce((n, k) => n + (byKind[k] ?? 0), 0)]),
    ) as Record<(typeof GAMES)[number]["mode"], number>
  }, [sets])
  return (
    <section aria-labelledby="games">
      <h2 id="games" className="text-micro text-saffron-spark uppercase">
        Games
      </h2>
      <ul className="mt-4 border-t border-border">
        {GAMES.map((game, i) => {
          const n = counts[game.mode] ?? 0
          return (
            <li key={game.mode} className="border-b border-border">
              <Link
                href={sessionHref({ mode: game.mode })}
                aria-disabled={!n}
                tabIndex={n ? undefined : -1}
                className={cn(
                  "group flex items-center gap-4 py-4 pr-1 transition-colors duration-(--duration-press)",
                  // Unavailable games stay readable (what it is, why it's waiting); only the arrow goes.
                  n ? "hover:bg-accent" : "pointer-events-none",
                )}
              >
                <span className="w-6 shrink-0 pl-1 text-snippet text-ash-gray tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-subhead text-bone-white">{game.name}</span>
                  <span className="mt-0.5 block text-snippet text-ash-gray">{game.about}</span>
                </span>
                <span className="hidden shrink-0 text-meta text-ash-gray sm:block">
                  {n
                    ? plural(n, "item")
                    : game.mode === "compare"
                      ? "Needs 2+ sources"
                      : "No items yet"}
                </span>
                <ArrowRightIcon
                  className={cn(
                    "size-4 shrink-0 text-ash-gray transition-transform duration-(--duration-press) group-hover:translate-x-0.5 group-hover:text-bone-white",
                    !n && "invisible",
                  )}
                  strokeWidth={1.5}
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SetStatus({ set }: { set: SetSummary }) {
  if (set.status === "generating")
    return (
      <span className="inline-flex items-center gap-1.5 text-snippet text-silver-mist">
        <Spinner className="size-3" />
        Making practice · {plural(set.made, "item")} checked
        {set.passages ? ` from ${plural(set.passages, "passage")}` : ""}
      </span>
    )
  if (set.status === "failed" && !set.items)
    return <span className="text-snippet text-ash-gray">{set.problem}</span>
  return (
    <span className="text-snippet text-ash-gray">
      {[
        plural(set.items, "item"),
        set.due ? `${set.due} due` : null,
        set.fresh ? `${set.fresh} new` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  )
}

/** The person's practice sets: practise one, play a game with it, or delete it. */
export function SetList() {
  const { data: sets, isPending } = useSets()
  const queryClient = useQueryClient()
  const router = useRouter()
  if (isPending)
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  if (!sets?.length) return null
  const remove = async (set: SetSummary) => {
    try {
      await api(`/api/study/sets/${set.id}`, { method: "DELETE" })
      void queryClient.invalidateQueries({ queryKey: studyKeys.all })
      toast.success(`Deleted “${set.title}”`)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <section aria-labelledby="your-sets">
      <h2 id="your-sets" className="text-micro text-saffron-spark uppercase">
        Your practice
      </h2>
      <ul className="mt-4 border-t border-border">
        {sets.map((set) => (
          <li
            key={set.id}
            className="flex min-h-15 items-center gap-3 border-b border-border py-2.5 pl-1"
          >
            <FolderIcon className="size-4 shrink-0 text-ash-gray" strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ui text-bone-white">{set.title}</span>
              <SetStatus set={set} />
            </span>
            {(set.items > 0 || set.status === "generating") && (
              <Button
                variant="secondary"
                size="sm"
                render={<Link href={sessionHref({ mode: "quiz", set: set.id })} />}
                nativeButton={false}
              >
                Practise
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`More for ${set.title}`}>
                    <EllipsisIcon strokeWidth={1.5} />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                {GAMES.filter((g) => g.kinds.some((k) => (set.kinds[k] ?? 0) > 0)).map((g) => (
                  <DropdownMenuItem
                    key={g.mode}
                    onClick={() => router.push(sessionHref({ mode: g.mode, set: set.id }))}
                  >
                    {g.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void remove(set)}>
                  Delete practice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
    </section>
  )
}
