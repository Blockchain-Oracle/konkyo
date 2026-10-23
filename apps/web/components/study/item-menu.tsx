"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Input } from "@konkyo/ui/components/input"
import { Spinner } from "@konkyo/ui/components/spinner"
import { Textarea } from "@konkyo/ui/components/textarea"
import { EllipsisIcon, FlagIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import type { RoundItem } from "@/lib/study"

type Edited = Pick<RoundItem, "prompt" | "answer" | "accepted" | "hints" | "steps">

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-snippet text-silver-mist">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-meta text-ash-gray">{hint}</p>}
    </div>
  )
}

/** Edit (F27): the change is checked against the passage; if the source doesn't support it, say so. */
function EditDialog({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: RoundItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (edited: Edited) => void
}) {
  const [prompt, setPrompt] = useState(item.prompt)
  const [answer, setAnswer] = useState(item.answer)
  const [accepted, setAccepted] = useState(item.accepted.join("; "))
  const [hint1, setHint1] = useState(item.hints[0] ?? "")
  const [hint2, setHint2] = useState(item.hints[1] ?? "")
  const [steps, setSteps] = useState((item.steps ?? []).join("\n"))
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const typed = item.kind === "recall" || item.kind === "cloze"

  const save = async (keepUnchecked = false) => {
    setSaving(true)
    const edited: Edited = {
      prompt: prompt.trim(),
      answer: answer.trim(),
      accepted: accepted
        .split(";")
        .map((a) => a.trim())
        .filter(Boolean),
      hints: [hint1, hint2].map((h) => h.trim()).filter(Boolean),
      steps:
        item.kind === "order"
          ? steps
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
    }
    try {
      const result = await api<{ saved: boolean; checked?: boolean; problem?: string }>(
        `/api/study/items/${item.id}`,
        { method: "PATCH", json: { ...edited, keepUnchecked } },
      )
      if (!result.saved) {
        setProblem(result.problem || "The source doesn't support this answer.")
        return
      }
      onSaved(edited)
      onOpenChange(false)
      toast.success(
        result.checked ? "Saved · checked against the source" : "Saved, marked not checked",
      )
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
          <DialogTitle>Edit this item</DialogTitle>
          <DialogDescription>
            Konkyo checks your change against the passage before saving it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label={
              item.kind === "cloze"
                ? "Sentence (____ marks the blank)"
                : item.kind === "truefalse"
                  ? "Statement"
                  : item.kind === "order"
                    ? "What the steps are of"
                    : "Question"
            }
          >
            {(id) => (
              <Textarea
                id={id}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="resize-none"
              />
            )}
          </Field>
          {typed && (
            <>
              <Field label="Answer">
                {(id) => (
                  <Input id={id} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                )}
              </Field>
              <Field label="Also accept" hint="Separate with semicolons.">
                {(id) => (
                  <Input id={id} value={accepted} onChange={(e) => setAccepted(e.target.value)} />
                )}
              </Field>
            </>
          )}
          {item.kind === "truefalse" && (
            <Field label="True or false">
              {(id) => (
                <select
                  id={id}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-ui"
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              )}
            </Field>
          )}
          {item.kind === "order" && (
            <Field label="Steps, in order" hint="One per line, 3 to 6.">
              {(id) => (
                <Textarea
                  id={id}
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
              )}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hint 1">
              {(id) => <Input id={id} value={hint1} onChange={(e) => setHint1(e.target.value)} />}
            </Field>
            <Field label="Hint 2">
              {(id) => <Input id={id} value={hint2} onChange={(e) => setHint2(e.target.value)} />}
            </Field>
          </div>
          {problem && (
            <p className="rounded-lg border border-saffron-spark/40 bg-saffron-spark/8 px-3 py-2 text-snippet text-bone-white">
              {problem}
            </p>
          )}
        </div>
        <DialogFooter>
          {problem && (
            <Button variant="ghost" onClick={() => void save(true)} disabled={saving}>
              Save anyway, unchecked
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving || !prompt.trim()}>
            {saving && <Spinner />}
            Check and save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** This is wrong (F27): the Verifier checks again with the reason. */
function WrongDialog({
  item,
  open,
  onOpenChange,
  onRemoved,
}: {
  item: RoundItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onRemoved: () => void
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [stands, setStands] = useState<{ why: string; quote?: string } | null>(null)
  const id = useId()
  const send = async () => {
    setBusy(true)
    try {
      const result = await api<{ removed: boolean; why: string; quote?: string }>(
        `/api/study/items/${item.id}/wrong`,
        { method: "POST", json: { reason: reason.trim() || undefined } },
      )
      if (result.removed) {
        onOpenChange(false)
        onRemoved()
        toast.success("Removed. Konkyo will remember this", { description: result.why })
      } else setStands({ why: result.why, quote: result.quote })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const removeAnyway = async () => {
    await api(`/api/study/items/${item.id}`, { method: "DELETE" }).catch(() => null)
    onOpenChange(false)
    onRemoved()
    toast.success("Removed")
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setStands(null)
          setReason("")
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{stands ? "Checked again" : "What's wrong with it?"}</DialogTitle>
          <DialogDescription>
            {stands
              ? "The Verifier read the passage again and thinks the item holds."
              : "The Verifier reads the passage again. If it agrees, the item goes and Konkyo remembers why."}
          </DialogDescription>
        </DialogHeader>
        {stands ? (
          <div className="space-y-3">
            <p className="text-reading text-bone-white">{stands.why}</p>
            {stands.quote && (
              <blockquote className="border-l-2 border-saffron-spark/60 pl-3 text-snippet text-silver-mist">
                “{stands.quote}”
              </blockquote>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor={id} className="text-snippet text-silver-mist">
              Reason (optional)
            </label>
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="The answer is…, or the question is unclear because…"
              className="resize-none"
            />
          </div>
        )}
        <DialogFooter>
          {stands ? (
            <>
              <Button variant="ghost" onClick={() => void removeAnyway()}>
                Remove anyway
              </Button>
              <Button onClick={() => onOpenChange(false)}>Keep it</Button>
            </>
          ) : (
            <Button onClick={() => void send()} disabled={busy}>
              {busy && <Spinner />}
              Check again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Edit / Remove / This is wrong, on every item (F27). */
export function ItemMenu({
  item,
  onEdited,
  onRemoved,
}: {
  item: RoundItem
  onEdited: (edited: Edited) => void
  onRemoved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [reporting, setReporting] = useState(false)
  const remove = async () => {
    try {
      await api(`/api/study/items/${item.id}`, { method: "DELETE" })
      onRemoved()
      toast.success("Item removed", {
        action: {
          label: "Undo",
          onClick: () =>
            void api(`/api/study/items/${item.id}/restore`, { method: "POST" }).then(
              () => toast.success("Restored. It's back in your practice."),
              (error: Error) => toast.error(error.message),
            ),
        },
      })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Item options"
              className="text-ash-gray"
            >
              <EllipsisIcon strokeWidth={1.5} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          {item.kind !== "evidence" && item.kind !== "compare" && (
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <PencilIcon strokeWidth={1.5} />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setReporting(true)}>
            <FlagIcon strokeWidth={1.5} />
            This is wrong
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void remove()}>
            <Trash2Icon strokeWidth={1.5} />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && (
        <EditDialog item={item} open={editing} onOpenChange={setEditing} onSaved={onEdited} />
      )}
      <WrongDialog item={item} open={reporting} onOpenChange={setReporting} onRemoved={onRemoved} />
    </>
  )
}
