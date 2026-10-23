"use client"

import type { Citation, KonkyoMessage } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { Popover, PopoverContent, PopoverTrigger } from "@konkyo/ui/components/popover"
import { Textarea } from "@konkyo/ui/components/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, CopyIcon, RotateCcwIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
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

function Action({
  label,
  onClick,
  pressed,
  children,
  render,
}: {
  label: string
  onClick?: () => void
  pressed?: boolean
  children: React.ReactNode
  /** When the button is also another trigger (the 👎 popover). */
  render?: (button: ReactElement) => ReactElement
}) {
  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "text-ash-gray hover:text-bone-white [&_svg]:stroke-[1.5]",
        pressed && "text-bone-white",
      )}
    />
  )
  return (
    <Tooltip>
      <TooltipTrigger render={render ? render(button) : button}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
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
}: {
  message: KonkyoMessage
  body: string
  caveat?: string
  citations: Citation[]
  /** Only on the latest answer. */
  onRegenerate?: () => void
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

  const copy = async () => {
    await navigator.clipboard.writeText(asText(body, caveat, citations))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-3 -ml-2 flex items-center gap-0.5">
      <Action label={copied ? "Copied" : "Copy with sources"} onClick={copy}>
        {copied ? <CheckIcon className="text-supports" /> : <CopyIcon />}
      </Action>
      <Action
        label={rating === "up" ? "Remove rating" : "Good answer"}
        pressed={rating === "up"}
        onClick={() => void rate(rating === "up" ? null : "up")}
      >
        <ThumbsUpIcon className={cn(rating === "up" && "fill-current")} />
      </Action>
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
          pressed={rating === "down"}
          render={(button) => <PopoverTrigger render={button} />}
        >
          <ThumbsDownIcon className={cn(rating === "down" && "fill-current")} />
        </Action>
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
      {onRegenerate && (
        <Action label="Ask again" onClick={onRegenerate}>
          <RotateCcwIcon />
        </Action>
      )}
    </div>
  )
}
