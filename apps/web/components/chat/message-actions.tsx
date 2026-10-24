"use client"

import type { Citation, KonkyoMessage } from "@konkyo/agents"
import { SPACES } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { Popover, PopoverContent, PopoverTrigger } from "@konkyo/ui/components/popover"
import { Textarea } from "@konkyo/ui/components/textarea"
import { cn } from "@konkyo/ui/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { answerToNote } from "@/lib/answer-to-note"
import { api } from "@/lib/fetcher"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"
import { useSpaceList } from "@/lib/use-spaces"
import { whereIs } from "./citation-chip"

/** What a 👎 can say (plan F17); the reason is what H-MEM remembers. */
const REASONS = ["Not in the source", "Wrong source", "Missed something", "Not what I asked"]

type Rating = "up" | "down" | null

/** The answer as text that keeps its grounds: markers in place, then each source and its quote. */
function asText(body: string, caveat: string | undefined, citations: Citation[]) {
  const seen = new Map<number, Citation>()
  for (const c of citations) if (!seen.has(c.n)) seen.set(c.n, c)
  const sources = [...seen.values()]
    .sort((a, b) => a.n - b.n)
    .map((c) => {
      const where = [c.byline, whereIs(c)].filter(Boolean).join(", ")
      return `[${c.n}] ${c.title}${where ? ` (${where})` : ""}: “${c.quote}”`
    })
  return [body, caveat, sources.length ? `Sources\n${sources.join("\n")}` : ""]
    .filter(Boolean)
    .join("\n\n")
}

/** An answer's action as a word on a pill (no icons): pressed turns it into a black sticker. */
function Action({
  label,
  word,
  onClick,
  pressed,
  render,
}: {
  label: string
  word: string
  onClick?: () => void
  pressed?: boolean
  /** When the button is also another trigger (the "not right" popover). */
  render?: (button: ReactElement) => ReactElement
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full border border-border px-3 text-[12.5px] font-semibold text-silver-mist transition-[background-color,color,translate] duration-(--dur-quick) ease-(--ease-glide) hover:-translate-y-px hover:bg-accent hover:text-bone-white",
        pressed && "border-transparent bg-sticker text-white hover:bg-sticker hover:text-white",
      )}
    >
      {word}
    </button>
  )
  return render ? render(button) : button
}

/**
 * Under a finished answer (plan F17): copy it with its sources, rate it, ask again. A 👎 asks
 * what was wrong; that reason becomes a correction Konkyo reads next time (H-MEM).
 */
export function MessageActions({
  message,
  body,
  caveat,
  citations,
  onRegenerate,
  question = "",
}: {
  message: KonkyoMessage
  body: string
  caveat?: string
  citations: Citation[]
  /** Only on the latest answer. */
  onRegenerate?: () => void
  /** The question it answers: the saved note's heading. */
  question?: string
}) {
  const router = useRouter()
  const [rating, setRating] = useState<Rating>(message.metadata?.feedback ?? null)
  const [copied, setCopied] = useState(false)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState("")

  const rate = async (next: Rating, extra?: { reason: string; note?: string }) => {
    const previous = rating
    setRating(next)
    try {
      const { remembered } = await api<{ remembered: boolean }>(
        `/api/messages/${message.id}/feedback`,
        { method: "POST", json: { rating: next, ...extra } },
      )
      if (remembered)
        toast.success("Konkyo will remember this", {
          description: "It shapes the next answer to a question like this one.",
          action: { label: "Memory", onClick: () => router.push("/settings/memory") },
        })
    } catch (error) {
      setRating(previous)
      toast.error((error as Error).message)
    }
  }

  const [saving, setSaving] = useState(false)
  const { data: notes } = useQuery({
    queryKey: ["notes"],
    queryFn: () =>
      api<{ notes: { id: string; title: string }[] }>("/api/notes").then((r) => r.notes),
    enabled: saving,
  })
  // Save to note (F17): a new note, or the end of one you have.
  const saveTo = async (noteId: string | null) => {
    setSaving(false)
    const { nodes, text } = answerToNote(question, body, caveat, citations)
    try {
      const id = noteId
        ? (await api(`/api/notes/${noteId}/append`, {
            method: "POST",
            json: { content: nodes, text },
          }),
          noteId)
        : (
            await api<{ id: string }>("/api/notes", {
              method: "POST",
              json: {
                title: question.slice(0, 120) || "From a chat",
                content: { type: "doc", content: nodes },
                text,
              },
            })
          ).id
      const title = noteId ? notes?.find((n) => n.id === noteId)?.title : null
      toast.success(title ? `Added to “${title}”` : "Saved to a new note", {
        description: "With its citations.",
        action: { label: "Open", onClick: () => router.push(`/write/${id}` as never) },
      })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  // Pin to a space's wall (F52): a frozen copy of this checked answer, on the space you pick.
  const queryClient = useQueryClient()
  const [pinning, setPinning] = useState(false)
  const [pinnedTo, setPinnedTo] = useState<string | null>(null)
  const { data: spaces } = useSpaceList()
  const runId = message.metadata?.runId
  const pinTo = async (space: { id: string; name: string }) => {
    setPinning(false)
    if (!runId) return
    try {
      await api(`/api/spaces/${space.id}/pins`, { method: "POST", json: { runId } })
      setPinnedTo(space.name)
      sound("promote")
      void queryClient.invalidateQueries({ queryKey: qk.spaces.pins(space.id) })
      toast.success(`Pinned to ${space.name.toLowerCase()}`, {
        action: { label: "Open", onClick: () => router.push(`/spaces/${space.id}` as never) },
      })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(asText(body, caveat, citations))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      <Action
        label={copied ? "Copied" : "Copy with sources"}
        word={copied ? "copied ✓" : "copy"}
        onClick={copy}
      />
      <Action
        label={rating === "up" ? "Remove rating" : "Good answer"}
        word={rating === "up" ? "good ✓" : "good"}
        pressed={rating === "up"}
        onClick={() => void rate(rating === "up" ? null : "up")}
      />
      <Popover
        open={asking}
        onOpenChange={(open) => {
          // A second 👎 takes the rating back instead of asking again.
          if (open && rating === "down") return void rate(null)
          setAsking(open)
          if (open) {
            setReason(null)
            setNote("")
          }
        }}
      >
        <Action
          label={rating === "down" ? "Remove rating" : "Something's wrong"}
          word={rating === "down" ? "not right ✓" : "not right"}
          pressed={rating === "down"}
          render={(button) => <PopoverTrigger render={button} />}
        />
        <PopoverContent className="w-80">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!reason) return
              setAsking(false)
              void rate("down", { reason, note: note.trim() || undefined })
            }}
          >
            <p className="text-ui text-bone-white">What was wrong?</p>
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
              {REASONS.map((r) => (
                // biome-ignore lint/a11y/useSemanticElements: chips, not native radios
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    "h-7 rounded-full border px-3 text-snippet transition-colors duration-(--duration-press)",
                    reason === r
                      ? "border-bone-white/80 bg-bone-white text-black"
                      : "border-border text-silver-mist hover:border-white/24 hover:text-bone-white",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="What's right? (optional)"
              aria-label="What's right"
              className="mt-3 min-h-16 resize-none text-snippet"
            />
            <p className="mt-2 text-meta text-ash-gray">
              Konkyo keeps this as a correction and reads it before answering anything like it.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!reason}>
                Send
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
      <Popover open={saving} onOpenChange={setSaving}>
        <Action
          label="Save to note"
          word="to a note"
          render={(button) => <PopoverTrigger render={button} />}
        />
        <PopoverContent className="w-64 p-1">
          <button
            type="button"
            onClick={() => void saveTo(null)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-snippet text-bone-white hover:bg-white/6"
          >
            <span aria-hidden className="w-3.5 text-center font-bold text-lime">
              +
            </span>
            New note
          </button>
          {notes?.slice(0, 5).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void saveTo(n.id)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-snippet text-silver-mist hover:bg-white/6"
            >
              <span className="truncate">{n.title}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {runId && (spaces?.length ?? 0) > 0 && (
        <Popover open={pinning} onOpenChange={setPinning}>
          <Action
            label={pinnedTo ? `Pinned to ${pinnedTo}` : "Pin to a space's wall"}
            word={pinnedTo ? "pinned ✓" : "pin"}
            pressed={Boolean(pinnedTo)}
            render={(button) => <PopoverTrigger render={button} />}
          />
          <PopoverContent className="w-64 p-1">
            <p className="px-2.5 pt-2 pb-1 text-meta text-ash-gray">Pin to a space's wall</p>
            {spaces?.map((space) => (
              <button
                key={space.id}
                type="button"
                onClick={() => void pinTo(space)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-snippet text-bone-white hover:bg-white/6"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: SPACES.colors[space.color].hex }}
                />
                <span className="truncate">{space.name.toLowerCase()}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {onRegenerate && <Action label="Ask again" word="ask again" onClick={onRegenerate} />}
    </div>
  )
}
