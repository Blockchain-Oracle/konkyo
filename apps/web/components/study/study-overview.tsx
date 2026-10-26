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
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { FocusPicker } from "@/components/chat/focus-picker"
import { api } from "@/lib/fetcher"
import { type Focus, isWholeLibrary, toggleFocus, useFocusItems, WHOLE_LIBRARY } from "@/lib/focus"
import { sound } from "@/lib/sounds"
import type { SetSummary } from "@/lib/study"
import { useSpaceList } from "@/lib/use-spaces"
import { sessionHref, studyKeys, useQuizMe, useSets } from "@/lib/use-study"
import { GAME_LOOK, type GameId } from "./games"

/** The five games, each built from the same verified items. */
export const GAMES = [
  {
    mode: "recall",
    name: "recall sprint",
    about: "Short answers and fill-in-the-blanks. Typing it beats recognising it.",
    kinds: ["recall", "cloze"],
    empty: "Make practice first: every set has these.",
  },
  {
    mode: "fix",
    name: "fix the false statement",
    about: "True or false, then rewrite the false ones in the source's own words.",
    kinds: ["truefalse"],
    empty: "Make practice first: every set has these.",
  },
  {
    mode: "evidence",
    name: "find the evidence",
    about: "Which passage says this? The other options are real passages from your library.",
    // Counted by the server: recall items and true statements (lib/study.ts `asksEvidence`).
    kinds: ["evidence"],
    empty: "Make practice first: built from its recall questions.",
  },
  {
    mode: "order",
    name: "order the steps",
    about: "Put a real sequence back in order: stages, methods, mechanisms.",
    kinds: ["order"],
    empty: "Waiting for a source that describes a real sequence.",
  },
  {
    mode: "compare",
    name: "compare the sources",
    about: "Do two of your sources agree? Then point to where each says so.",
    kinds: ["compare"],
    empty: "Needs two sources that discuss the same point.",
  },
] as const

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Each game drawn as how it plays (no icons). */
function GameArt({ game }: { game: GameId }) {
  if (game === "recall") return <span className="tile-typed">adenosine</span>
  if (game === "fix")
    return (
      <span className="tile-tf">
        <span>true</span>
        <span>false</span>
      </span>
    )
  if (game === "evidence")
    return (
      <span className="tile-slips" aria-hidden>
        <i />
        <i className="is-on" />
        <i />
      </span>
    )
  if (game === "order")
    return (
      <span className="tile-steps" aria-hidden>
        <span>1 · encode</span>
        <span>2 · sleep</span>
        <span>3 · recall</span>
      </span>
    )
  return (
    <span className="tile-sides" aria-hidden>
      <span>A</span>
      <b className="text-[13px]">agree?</b>
      <span>B</span>
    </span>
  )
}

/**
 * Quiz me (F27), on a taped sheet: pick what to practise from (the whole library, one of your
 * spaces in its colour and symbol, or any file or folder) and go.
 */
export function MakePractice() {
  const items = useFocusItems()
  const { data: spaces } = useSpaceList()
  const quizMe = useQuizMe()
  const router = useRouter()
  const [focus, setFocus] = useState<Focus>(WHOLE_LIBRARY)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // What's picked that isn't one of the space chips (a file, a folder inside a space).
  const others = useMemo(() => {
    const spaceIds = new Set(spaces?.map((s) => s.id))
    return items.filter(
      (i) =>
        (i.type === "file" ? focus.fileIds : focus.folderIds).includes(i.id) && !spaceIds.has(i.id),
    )
  }, [items, focus, spaces])
  const start = async () => {
    setBusy(true)
    sound("promote")
    try {
      router.push(await quizMe(focus))
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }
  const toggleSpace = (id: string) => {
    sound("tap")
    setFocus((f) => ({
      ...f,
      folderIds: f.folderIds.includes(id)
        ? f.folderIds.filter((x) => x !== id)
        : [...f.folderIds, id],
    }))
  }
  const chip =
    "inline-flex h-10 max-w-64 items-center gap-2 rounded-full border-2 border-ink px-3.5 text-[14px] font-bold transition-transform duration-(--dur-quick) hover:-translate-y-0.5"
  return (
    <section aria-labelledby="make-practice" className="surface-paper board-sheet relative">
      <span className="board-tape" aria-hidden />
      <p className="text-[12px] font-extrabold text-ink-muted">quiz me</p>
      <h2
        id="make-practice"
        className="mt-1 font-display text-[clamp(1.7rem,1.3rem+1.2vw,2.3rem)] leading-[1] font-extrabold tracking-[-0.03em] text-ink lowercase"
      >
        practice from…
      </h2>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFocus(WHOLE_LIBRARY)}
          aria-pressed={isWholeLibrary(focus)}
          className={cn(chip, isWholeLibrary(focus) ? "bg-ink text-white" : "bg-white text-ink")}
        >
          whole library
        </button>
        {spaces?.map((space) => {
          const hex = SPACES.colors[space.color].hex
          const on = focus.folderIds.includes(space.id)
          return (
            <button
              key={space.id}
              type="button"
              onClick={() => toggleSpace(space.id)}
              aria-pressed={on}
              className={chip}
              style={on ? { background: hex, color: readableInk(hex) } : { background: "#ffffff" }}
            >
              <span aria-hidden>{`${space.symbol}︎`}</span>
              <span className="truncate">{space.name.toLowerCase()}</span>
              {on && <span aria-hidden>✓</span>}
            </button>
          )
        })}
        {others.map((item) => (
          <button
            key={`${item.type}:${item.id}`}
            type="button"
            onClick={() => setFocus(toggleFocus(focus, item))}
            className={cn(chip, "bg-butter text-ink")}
            aria-label={`Remove ${item.name}`}
          >
            <span className="truncate">{item.name}</span>
            <span aria-hidden>×</span>
          </button>
        ))}
        <FocusPicker
          items={items}
          focus={focus}
          onChange={setFocus}
          open={open}
          onOpenChange={setOpen}
          side="bottom"
          trigger={
            <button type="button" className={cn(chip, "border-dashed bg-transparent text-ink")}>
              + a file or folder
            </button>
          }
        />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xs text-[13.5px] leading-snug text-ink-muted">
          Every answer key is checked against its passage before you see it.
        </p>
        <Button
          size="lg"
          onClick={() => void start()}
          disabled={busy}
          className="h-14 px-6 text-[17px]"
        >
          {busy ? <Spinner /> : null}
          quiz me ↗
        </Button>
      </div>
    </section>
  )
}

/** The five games, each a tile in its own colour, with how many questions it has to play. */
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
      <div className="board-label">
        <h2 id="games" className="room-pill">
          games · the same checked questions, five ways
        </h2>
      </div>
      <ul className="game-tiles">
        {GAMES.map((game) => {
          const n = counts[game.mode] ?? 0
          const look = GAME_LOOK[game.mode]
          const style = {
            "--game": look.accent,
            "--game-ink": readableInk(look.accent),
          } as CSSProperties
          const body = (
            <>
              <span className="game-tile-art">
                <GameArt game={game.mode} />
              </span>
              <span className="game-tile-name">{game.name}</span>
              <span className="game-tile-line">{n ? game.about : game.empty}</span>
              <span className="game-tile-foot">
                <span className="game-tile-count">{n ? plural(n, "question") : "none yet"}</span>
                {n ? <span className="game-tile-play">play ↗</span> : null}
              </span>
            </>
          )
          return (
            <li key={game.mode} className="flex">
              {n ? (
                <Link
                  href={sessionHref({ mode: game.mode })}
                  onClick={() => sound("tap")}
                  className="game-tile w-full"
                  style={style}
                >
                  {body}
                </Link>
              ) : (
                <div className="game-tile is-waiting w-full" style={style}>
                  {body}
                </div>
              )}
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
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
        <Spinner className="size-3" />
        writing questions · {plural(set.made, "question")} checked
        {set.passages ? ` from ${plural(set.passages, "passage")}` : ""}
      </span>
    )
  if (set.status === "failed" && !set.items)
    return <span className="text-[13px] font-semibold text-contradicts">{set.problem}</span>
  return (
    <span className="text-[13px] font-semibold text-ink-muted">
      {[
        plural(set.items, "question"),
        set.due ? `${set.due} due` : null,
        set.fresh ? `${set.fresh} new` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  )
}

/** Which games a set feeds, as dots in each game's colour. */
function KindDots({ set }: { set: SetSummary }) {
  const games = GAMES.filter((g) => g.kinds.some((k) => (set.kinds[k] ?? 0) > 0))
  if (!games.length) return null
  return (
    <span className="flex items-center gap-1" title={games.map((g) => g.name).join(", ")}>
      {games.map((g) => (
        <span
          key={g.mode}
          className="size-3 rounded-full ring-2 ring-ink"
          style={{ background: GAME_LOOK[g.mode].accent }}
        />
      ))}
    </span>
  )
}

/** Your practice sets, on a sheet: practise one, play a game with it, or delete it. */
export function SetList() {
  const { data: sets, isPending } = useSets()
  const queryClient = useQueryClient()
  const router = useRouter()
  const quizMe = useQuizMe()
  // An agent's card sends you here with ?set=: bring that set into view and light it for a moment.
  const [lit, setLit] = useState<string | null>(null)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("set")
    if (!id || !sets?.some((s) => s.id === id)) return
    setLit(id)
    document.getElementById(`set-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    window.history.replaceState(null, "", window.location.pathname)
    const timer = window.setTimeout(() => setLit(null), 3200)
    return () => window.clearTimeout(timer)
  }, [sets])
  if (isPending)
    return (
      <div className="surface-paper board-sheet space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  if (!sets?.length) return null
  const again = async (set: SetSummary) => {
    sound("promote")
    try {
      const href = await quizMe(set.scope, set.title)
      await api(`/api/study/sets/${set.id}`, { method: "DELETE" })
      void queryClient.invalidateQueries({ queryKey: studyKeys.all })
      router.push(href)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
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
      <div className="board-label">
        <h2 id="your-sets" className="room-pill">
          your practice · <b>{sets.length}</b> set{sets.length === 1 ? "" : "s"}
        </h2>
      </div>
      <ul className="surface-paper board-sheet px-5! py-2!">
        {sets.map((set, i) => (
          <li
            key={set.id}
            id={`set-${set.id}`}
            className={cn(
              "flex min-h-16 scroll-mt-40 items-center gap-3.5 py-3 transition-colors duration-500",
              i > 0 && "border-t border-ink/10",
              lit === set.id && "-mx-3 rounded-2xl bg-lime/45 px-3",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2.5">
                <span className="truncate font-display text-[17px] font-extrabold tracking-[-0.015em] text-ink">
                  {set.title}
                </span>
                <KindDots set={set} />
              </span>
              <SetStatus set={set} />
            </span>
            {set.status === "failed" && !set.items && (
              <Button size="sm" onClick={() => void again(set)}>
                try again
              </Button>
            )}
            {(set.items > 0 || set.status === "generating") && (
              <Button
                variant="sticker"
                size="sm"
                render={<Link href={sessionHref({ mode: "quiz", set: set.id }) as Route} />}
                nativeButton={false}
              >
                practise ↗
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`More for ${set.title}`}>
                    <span
                      aria-hidden
                      className="text-[15px] leading-none tracking-[0.08em] text-ink"
                    >
                      •••
                    </span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                {GAMES.filter((g) => g.kinds.some((k) => (set.kinds[k] ?? 0) > 0)).map((g) => (
                  <DropdownMenuItem
                    key={g.mode}
                    onClick={() => router.push(sessionHref({ mode: g.mode, set: set.id }))}
                  >
                    play {g.name}
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
