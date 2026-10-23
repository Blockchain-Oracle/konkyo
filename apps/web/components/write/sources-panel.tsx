"use client"

import type { CitationMatch } from "@konkyo/agents"
import type { FileKind } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Textarea } from "@konkyo/ui/components/textarea"
import { cn } from "@konkyo/ui/lib/utils"
import { ArrowUpRightIcon, CheckIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { KindIcon } from "@/components/library/kind-icon"
import { api } from "@/lib/fetcher"
import { openSource } from "@/lib/preview"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
const whereOf = (m: { page: number | null; tStart: number | null }) =>
  m.page != null ? `p. ${m.page}` : m.tStart != null ? clock(m.tStart) : ""

/**
 * Search citation (plan F22): the selected words (or any words) against the library's sources.
 * Only passages whose quote was found in code and in Zetaris are offered; Insert puts the
 * citation where the selection ends.
 */
export function SourcesPanel({
  noteId,
  request,
  onInsert,
}: {
  noteId: string
  /** Text to look up, from the editor ("Find a source" on a selection or a claim). */
  request: { text: string; nonce: number } | null
  onInsert: (match: CitationMatch) => void
}) {
  const [text, setText] = useState("")
  const [results, setResults] = useState<CitationMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [inserted, setInserted] = useState<Set<string>>(new Set())

  const search = async (q: string) => {
    const words = q.trim()
    if (words.length < 3) return
    setBusy(true)
    setResults(null)
    try {
      const { matches } = await api<{ matches: CitationMatch[] }>(`/api/notes/${noteId}/cite`, {
        method: "POST",
        json: { text: words.slice(0, 2000) },
      })
      setResults(matches)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per request from the editor
  useEffect(() => {
    if (!request) return
    setText(request.text)
    setInserted(new Set())
    void search(request.text)
  }, [request?.nonce])

  return (
    <div className="flex h-full flex-col">
      <form
        className="border-b border-border p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void search(text)
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Select a sentence and choose Find a source, or type what needs one"
          aria-label="What needs a source"
          className="resize-none text-snippet"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void search(text)
            }
          }}
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={busy || text.trim().length < 3}
        >
          <SearchIcon strokeWidth={1.5} />
          {busy ? "Searching…" : "Find sources"}
        </Button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {busy && (
          <ul className="divide-y divide-border" aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
              <li key={i} className="space-y-2 p-4">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </li>
            ))}
          </ul>
        )}
        {results && !results.length && (
          <p className="p-4 text-snippet text-ash-gray">
            Nothing in your sources supports this yet. Try other words, or find sources with a deep
            search.
          </p>
        )}
        {results && results.length > 0 && (
          <ul className="divide-y divide-border">
            {results.map((m) => {
              const done = inserted.has(m.passageId + m.quote)
              return (
                <li key={m.passageId + m.quote} className="p-4">
                  <div className="flex items-start gap-2">
                    <KindIcon kind={m.kind as FileKind} className="mt-0.5 size-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-snippet text-bone-white">{m.title}</p>
                      <p className="mt-0.5 text-meta text-ash-gray">
                        {[m.byline, whereOf(m)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-meta",
                        m.support === "supported" ? "text-supports-text" : "text-partly",
                      )}
                    >
                      {m.support === "supported" ? "Supports" : "Partly"}
                    </span>
                  </div>
                  <blockquote className="mt-2.5 border-l-2 border-partly/70 pl-3 text-snippet leading-relaxed text-silver-mist">
                    “{m.quote}”
                  </blockquote>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={done ? "ghost" : "secondary"}
                      disabled={done}
                      onClick={() => {
                        onInsert(m)
                        setInserted((s) => new Set(s).add(m.passageId + m.quote))
                      }}
                    >
                      {done ? (
                        <CheckIcon className="text-supports" />
                      ) : (
                        <PlusIcon strokeWidth={1.75} />
                      )}
                      {done ? "Cited" : "Insert"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-ash-gray hover:text-bone-white"
                      onClick={() =>
                        openSource({
                          fileId: m.fileId,
                          title: m.title,
                          kind: m.kind as FileKind,
                          passageId: m.passageId,
                          quote: m.quote,
                        })
                      }
                    >
                      Open
                      <ArrowUpRightIcon strokeWidth={1.75} />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
