"use client"

import { Button } from "@konkyo/ui/components/button"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"

/**
 * "Right passage?" on a passage opened from a citation (plan §7.4 #2, F11, as Anara does). A 👎
 * is remembered as a correction (H-MEM) and read before citing for a similar question again.
 */
export function CitedBar({ messageId, n }: { messageId: string; n: number }) {
  const [vote, setVote] = useState<"right" | "wrong" | null>(null)
  const send = async (right: boolean) => {
    setVote(right ? "right" : "wrong")
    try {
      const { remembered } = await api<{ remembered: boolean }>(
        `/api/messages/${messageId}/citations/${n}`,
        { method: "POST", json: { right } },
      )
      if (remembered)
        toast.success("Konkyo will remember this", {
          description: "It won't lean on this passage for a question like that again.",
        })
    } catch (error) {
      setVote(null)
      toast.error((error as Error).message)
    }
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div className="pointer-events-auto flex animate-in items-center gap-1 rounded-full border border-border bg-overlay/95 py-1 pr-1 pl-3.5 shadow-lg duration-(--duration-menu) fade-in-0 slide-in-from-bottom-2">
        {vote ? (
          <span className="inline-flex items-center gap-1.5 py-1 pr-2.5 text-snippet text-silver-mist">
            <CheckIcon className="size-3.5 text-supports" strokeWidth={2} aria-hidden />
            {vote === "right" ? "Thanks" : "Noted as the wrong passage"}
          </span>
        ) : (
          <>
            <span className="text-snippet text-silver-mist">Citation {n} · Right passage?</span>
            {(["right", "wrong"] as const).map((kind) => (
              <Button
                key={kind}
                variant="ghost"
                size="icon-sm"
                aria-label={kind === "right" ? "Yes, the right passage" : "No, the wrong passage"}
                onClick={() => void send(kind === "right")}
                className={cn("text-ash-gray hover:text-bone-white [&_svg]:stroke-[1.5]")}
              >
                {kind === "right" ? <ThumbsUpIcon /> : <ThumbsDownIcon />}
              </Button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
