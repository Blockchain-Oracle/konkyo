"use client"

import { Button } from "@konkyo/ui/components/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@konkyo/ui/components/dialog"
import { Input } from "@konkyo/ui/components/input"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { cn } from "@konkyo/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { diffWords } from "diff"
import {
  BookmarkIcon,
  DownloadIcon,
  HistoryIcon,
  ListChecksIcon,
  QuoteIcon,
  SearchIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { useQuery } from "@/lib/use-query"
import { Citation } from "./citation-node"

type Version = { id: string; name: string | null; auto: boolean; words: number; createdAt: string }
type NoteEvent = { id: string; type: string; data: Record<string, unknown>; createdAt: string }

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const day = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" })

/** A version, read-only, with Restore (plan F24, §7.5: "Viewing … · Restore"). */
function VersionPreview({
  noteId,
  version,
  onClose,
  onRestore,
}: {
  noteId: string
  version: Version
  onClose: () => void
  onRestore: (content: unknown) => void
}) {
  const { data } = useQuery({
    queryKey: ["note-version", version.id],
    // compared with the note as it is now, never a copy from earlier
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: () =>
      api<{ content: unknown; text: string; now: string }>(
        `/api/notes/${noteId}/versions/${version.id}`,
      ),
  })
  const [view, setView] = useState<"changes" | "then">("changes")
  const editor = useEditor(
    {
      extensions: [StarterKit, Citation],
      content: (data?.content as object) ?? "",
      editable: false,
      immediatelyRender: false,
      editorProps: { attributes: { class: "note-prose" } },
    },
    [data],
  )
  const restore = useMutation({
    mutationFn: () =>
      api<{ content: unknown }>(`/api/notes/${noteId}/versions/${version.id}/restore`, {
        method: "POST",
      }),
    onSuccess: ({ content }) => {
      onRestore(content)
      toast.success("Restored", { description: "What was there is kept as a version too." })
      onClose()
    },
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-hidden sm:max-w-2xl">
        <DialogTitle className="text-subhead font-normal">
          Viewing {version.name ?? "autosave"} · {day.format(new Date(version.createdAt))},{" "}
          {time.format(new Date(version.createdAt))}
        </DialogTitle>
        <div className="flex gap-1.5">
          {(
            [
              ["changes", "what changed since"],
              ["then", "as it was"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12.5px] font-bold",
                view === id ? "bg-lime text-ink" : "text-ash-gray hover:text-bone-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="-mx-6 max-h-[60svh] overflow-y-auto border-y border-border px-6 py-4">
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : view === "then" ? (
            <EditorContent editor={editor} />
          ) : (
            <VersionDiff then={data.text} now={data.now} />
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => restore.mutate()} disabled={restore.isPending}>
            Restore this version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** How long the word-by-word comparison may run before it gives up. */
const DIFF_TIMEOUT_MS = 300

/**
 * What changed between a version and the note now, word by word (jsdiff): words taken out are
 * struck through, words put in are marked. Blank lines between paragraphs are kept.
 */
function VersionDiff({ then, now }: { then: string; now: string }) {
  // once per pair, and given up after a moment (a long rewrite would hold the page)
  const parts = useMemo(() => diffWords(then, now, { timeout: DIFF_TIMEOUT_MS }), [then, now])
  if (!parts)
    return (
      <p className="text-snippet text-ash-gray">
        Too much changed to compare word by word. “As it was” shows this version.
      </p>
    )
  const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  const added = parts.filter((p) => p.added).reduce((n, p) => n + words(p.value), 0)
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + words(p.value), 0)
  if (!added && !removed)
    return <p className="text-snippet text-ash-gray">Nothing has changed since this version.</p>
  return (
    <div className="version-diff">
      <p className="version-diff-sum">
        <ins>
          +{added} word{added === 1 ? "" : "s"}
        </ins>{" "}
        <del>
          −{removed} word{removed === 1 ? "" : "s"}
        </del>{" "}
        since this version
      </p>
      <p className="version-diff-text">
        {parts.map((p, i) =>
          p.added ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: the diff's runs, in order
            <ins key={i}>{p.value}</ins>
          ) : p.removed ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: the diff's runs, in order
            <del key={i}>{p.value}</del>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: the diff's runs, in order
            <span key={i}>{p.value}</span>
          ),
        )}
      </p>
    </div>
  )
}

/** Version history (F24): autosaves every ten minutes of writing, and versions you name. */
export function VersionsPanel({
  noteId,
  onRestore,
}: {
  noteId: string
  onRestore: (content: unknown) => void
}) {
  const queryClient = useQueryClient()
  const key = ["note-versions", noteId]
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ versions: Version[] }>(`/api/notes/${noteId}/versions`).then((r) => r.versions),
  })
  const [name, setName] = useState("")
  const [viewing, setViewing] = useState<Version | null>(null)
  const save = useMutation({
    mutationFn: (n: string) =>
      api(`/api/notes/${noteId}/versions`, { method: "POST", json: { name: n } }),
    onSuccess: () => {
      setName("")
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  let lastDay = ""
  return (
    <div className="flex h-full flex-col">
      <form
        className="flex gap-2 border-b border-border p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save.mutate(name.trim())
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Name this version (First draft…)"
          aria-label="Version name"
          className="h-9 rounded-lg text-snippet"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={!name.trim() || save.isPending}
        >
          <BookmarkIcon strokeWidth={1.5} />
          Save
        </Button>
      </form>
      <ul className="min-h-0 flex-1 overflow-y-auto py-2">
        {isPending && <Skeleton className="mx-4 my-2 h-24" />}
        {data && !data.length && (
          <li className="px-4 py-2 text-snippet text-ash-gray">
            Versions appear as you write: one every ten minutes, plus any you name.
          </li>
        )}
        {data?.map((v) => {
          const d = day.format(new Date(v.createdAt))
          const header = d !== lastDay
          lastDay = d
          return (
            <li key={v.id}>
              {header && <p className="px-4 pt-3 pb-1 text-micro text-ash-gray uppercase">{d}</p>}
              <button
                type="button"
                onClick={() => setViewing(v)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/4"
              >
                <HistoryIcon
                  className="size-3.5 shrink-0 text-ash-gray"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-snippet",
                    v.name ? "text-bone-white" : "text-silver-mist",
                  )}
                >
                  {v.name ?? "Autosave"}
                </span>
                <span className="shrink-0 text-meta text-ash-gray tabular-nums">
                  {v.words} words · {time.format(new Date(v.createdAt))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {viewing && (
        <VersionPreview
          noteId={noteId}
          version={viewing}
          onClose={() => setViewing(null)}
          onRestore={(content) => {
            onRestore(content)
            void queryClient.invalidateQueries({ queryKey: key })
          }}
        />
      )}
    </div>
  )
}

function describe(e: NoteEvent) {
  const d = e.data
  switch (e.type) {
    case "checked": {
      const c = d.counts as Record<string, number> | undefined
      return {
        icon: ListChecksIcon,
        text: `Checked the draft: ${[
          `${c?.supported ?? 0} supported`,
          `${c?.partly ?? 0} partly`,
          c?.contradicted ? `${c.contradicted} contradicted` : null,
          `${c?.["not-found"] ?? 0} not found`,
        ]
          .filter(Boolean)
          .join(", ")}`,
      }
    }
    case "searched-citation":
      return {
        icon: SearchIcon,
        text: `Looked for a source for “${String(d.text ?? "").slice(0, 90)}” (${d.found ?? 0} found)`,
      }
    case "cited":
      return {
        icon: QuoteIcon,
        text: `Cited ${String(d.title ?? "a source")}: “${String(d.quote ?? "").slice(0, 90)}”`,
      }
    case "removed-citation":
      return { icon: QuoteIcon, text: `Removed a citation of ${String(d.title ?? "a source")}` }
    case "restored":
      return {
        icon: HistoryIcon,
        text: `Restored ${d.name ? `“${String(d.name)}”` : "an earlier version"}`,
      }
    default:
      return { icon: HistoryIcon, text: e.type }
  }
}

/**
 * The process record (F25): what was done with Konkyo's help on this draft, in order, with the
 * version history; exported as an appendix (IB IA / EE style).
 */
export function RecordPanel({ noteId }: { noteId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["note-events", noteId],
    queryFn: () =>
      api<{ events: NoteEvent[] }>(`/api/notes/${noteId}/events`).then((r) => r.events),
    refetchInterval: 15_000,
  })
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <p className="w-full text-meta text-ash-gray">
          Every check, source search and citation made with Konkyo, plus the version history.
        </p>
        {(["docx", "pdf", "md"] as const).map((f) => (
          <Button
            key={f}
            variant="secondary"
            size="sm"
            render={<a href={`/api/notes/${noteId}/record?format=${f}`} download />}
            nativeButton={false}
          >
            <DownloadIcon strokeWidth={1.5} />
            {f === "docx" ? "Word" : f === "pdf" ? "PDF" : "Markdown"}
          </Button>
        ))}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto py-2">
        {isPending && <Skeleton className="mx-4 my-2 h-24" />}
        {data && !data.length && (
          <li className="px-4 py-2 text-snippet text-ash-gray">
            Nothing yet: checks and citations appear here.
          </li>
        )}
        {data?.map((e) => {
          const { icon: Icon, text } = describe(e)
          return (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2">
              <Icon
                className="mt-0.5 size-3.5 shrink-0 text-ash-gray"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-snippet text-silver-mist">{text}</span>
              <span className="shrink-0 text-meta text-ash-gray tabular-nums">
                {time.format(new Date(e.createdAt))}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
