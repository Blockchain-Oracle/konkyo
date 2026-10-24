"use client"

import { Button } from "@konkyo/ui/components/button"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { useMutation, useQuery } from "@tanstack/react-query"
import { NotebookPenIcon, PlusIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { api } from "@/lib/fetcher"

type NoteRow = { id: string; title: string; words: number; updatedAt: string; excerpt: string }

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, "hour")
  return relative.format(Math.round(hours / 24), "day")
}

/** Write (plan F21): every note, newest edit first, and a new one. */
export function NotesList() {
  const router = useRouter()
  const { data: notes, isPending } = useQuery({
    queryKey: ["notes"],
    queryFn: () => api<{ notes: NoteRow[] }>("/api/notes").then((r) => r.notes),
  })
  const create = useMutation({
    mutationFn: () => api<{ id: string }>("/api/notes", { method: "POST", json: {} }),
    onSuccess: ({ id }) => router.push(`/write/${id}` as Route),
    onError: (error: Error) => toast.error(error.message),
  })
  const newNote = (
    <Button onClick={() => create.mutate()} disabled={create.isPending}>
      <PlusIcon strokeWidth={1.75} />
      New note
    </Button>
  )

  if (isPending)
    return (
      <ul className="mt-9 space-y-2" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </ul>
    )
  if (!notes?.length)
    return (
      <div className="mt-15">
        <EmptyState
          label="Write"
          title="No notes yet"
          description="Write with your library beside you: find a source for any sentence, check every claim against your files, and export with citations in any style."
        >
          {newNote}
        </EmptyState>
      </div>
    )
  return (
    <>
      <div className="mt-9 flex justify-end">{newNote}</div>
      <ul className="mt-4.5 border-t border-border">
        {notes.map((n) => (
          <li
            key={n.id}
            className="relative flex min-h-16 items-center gap-3 border-b border-border px-2 py-3 transition-colors duration-(--duration-press) hover:bg-accent"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel">
              <NotebookPenIcon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/write/${n.id}` as Route}
                className="block truncate text-ui text-bone-white after:absolute after:inset-0 after:content-['']"
              >
                {n.title}
              </Link>
              <p className="mt-0.5 truncate text-meta text-ash-gray">
                {n.words} words · {ago(n.updatedAt)}
                {n.excerpt ? ` · ${n.excerpt}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
