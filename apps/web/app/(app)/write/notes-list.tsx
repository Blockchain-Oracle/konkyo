"use client"

import { SPACES } from "@konkyo/config"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { colorFor, tiltFor } from "@konkyo/ui/lib/space"
import { useMutation } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { api } from "@/lib/fetcher"
import { useQuery } from "@/lib/use-query"

type NoteRow = {
  id: string
  title: string
  words: number
  updatedAt: string
  excerpt: string
  published: boolean
  space: { id: string; name: string; color: keyof typeof SPACES.colors | null } | null
}

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
    <button
      type="button"
      className="claim-done"
      onClick={() => create.mutate()}
      disabled={create.isPending}
    >
      <PlusIcon className="size-4" strokeWidth={2.5} />
      new note
    </button>
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
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="room-pill">
          <b>{notes.length}</b> note{notes.length === 1 ? "" : "s"} ·{" "}
          {notes.filter((n) => n.published).length} published
        </span>
        <span className="ml-auto">{newNote}</span>
      </div>
      {/* every note as a sheet of paper, newest edit first (R4) */}
      <ul className="notes-grid">
        {notes.map((n) => (
          <li key={n.id} className="note-card" style={{ rotate: tiltFor(n.id, 300) }}>
            {n.published && <span className="note-published">published</span>}
            <Link href={`/write/${n.id}` as Route} className="note-card-title">
              {n.title}
            </Link>
            {n.excerpt && <p className="note-card-text">{n.excerpt}</p>}
            <p className="note-card-foot">
              {n.space && (
                <span className="note-card-space">
                  <i
                    aria-hidden
                    style={{ background: SPACES.colors[n.space.color ?? colorFor(n.space.id)].hex }}
                  />
                  {n.space.name.toLowerCase()}
                </span>
              )}
              <span>
                {n.words} words · {ago(n.updatedAt)}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
