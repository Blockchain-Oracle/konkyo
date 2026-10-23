"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Textarea } from "@konkyo/ui/components/textarea"
import { BrainIcon, MessageSquareIcon, PencilIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { EmptyState } from "@/components/empty-state"
import { type MemoryItem, useMemories, useMemoryActions } from "@/lib/use-memories"

const DAY = 86_400_000
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

function learnedLabel(m: MemoryItem) {
  const days = Math.round((m.learnedAt - Date.now()) / DAY)
  return [
    m.origin === "user_correction" ? "Your correction" : "Learned",
    days === 0 ? "today" : relative.format(days, "day"),
    m.recalled ? `read ${m.recalled} time${m.recalled === 1 ? "" : "s"}` : null,
    `trust ${Math.round(m.confidence * 100)}%`,
  ]
    .filter(Boolean)
    .join(" · ")
}

function MemoryRow({ memory }: { memory: MemoryItem }) {
  const { edit, forget } = useMemoryActions()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(memory.content)

  if (editing) {
    return (
      <li className="border-b border-border px-2 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const content = text.trim()
            if (content.length < 3) return
            edit.mutate({ id: memory.id, content })
            setEditing(false)
          }}
        >
          <Textarea
            autoFocus
            value={text}
            maxLength={500}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            aria-label="Memory"
            className="resize-none text-reading"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={text.trim().length < 3}>
              Save
            </Button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="group flex items-start gap-3 border-b border-border px-2 py-4">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-panel">
        <BrainIcon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-reading text-silver-mist">{memory.content}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-meta text-ash-gray">
          {learnedLabel(memory)}
          {memory.chatId && (
            <Link
              href={`/chats/${memory.chatId}`}
              className="inline-flex items-center gap-1 hover:text-bone-white"
            >
              · <MessageSquareIcon className="size-3" strokeWidth={1.5} aria-hidden />
              From a chat
            </Link>
          )}
        </p>
      </div>
      {/* Shown on hover and on focus; always there on touch screens. */}
      <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity duration-(--duration-press) md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit memory"
          className="text-ash-gray hover:text-bone-white"
          onClick={() => {
            setText(memory.content)
            setEditing(true)
          }}
        >
          <PencilIcon strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forget"
          className="text-ash-gray hover:text-contradicts"
          onClick={() => forget.mutate({ id: memory.id })}
        >
          <XIcon strokeWidth={1.5} />
        </Button>
      </div>
    </li>
  )
}

/**
 * What Konkyo remembers about how you want answers (plan F33): each 👎 with a reason becomes one
 * line here. The Planner and Writer read the relevant lines before answering; you can rewrite or
 * forget any of them. Stored per person in Meterless H-MEM, with every change in its ledger.
 */
export function MemoryView() {
  const { data: memories, isPending } = useMemories()
  const { forgetAll } = useMemoryActions()
  const [confirm, setConfirm] = useState(false)

  if (isPending) {
    return (
      <ul className="mt-9" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          <li key={i} className="flex h-18 items-center gap-3 border-b border-border px-2">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  if (!memories?.length) {
    return (
      <div className="mt-15">
        <EmptyState
          label="Memory"
          title="Nothing remembered yet"
          description="When an answer is wrong, give it a 👎 and say why. Konkyo keeps that here and reads it before answering anything like it again."
        />
      </div>
    )
  }

  return (
    <>
      <div className="mt-9 flex flex-wrap items-center gap-3 rounded-xl bg-panel px-4 py-3">
        <p className="flex-1 text-snippet text-silver-mist">
          Konkyo reads the lines that match a question before it plans and writes. They guide the
          answer; they are never cited as evidence.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
          Forget all
        </Button>
      </div>
      <ul className="mt-4.5 border-t border-border">
        {memories.map((m) => (
          <MemoryRow key={m.id} memory={m} />
        ))}
      </ul>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="text-subhead font-normal">Forget everything?</DialogTitle>
          <DialogDescription>
            Konkyo will stop using all {memories.length} memories. This can't be undone.
          </DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                forgetAll.mutate()
                setConfirm(false)
              }}
            >
              Forget all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
