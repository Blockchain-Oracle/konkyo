"use client"

import type { CslItem } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { Input } from "@konkyo/ui/components/input"
import { Sheet, SheetContent, SheetTitle } from "@konkyo/ui/components/sheet"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PanelRightOpenIcon,
  PencilIcon,
  RefreshCwIcon,
  ScanTextIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import { useId, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { authorsLine, personName, toBibtex, yearOf } from "@/lib/citation"
import { api } from "@/lib/fetcher"
import { openSource } from "@/lib/preview"
import { qk } from "@/lib/query-keys"
import { useHighlightActions, useHighlights } from "@/lib/use-highlights"
import { type FileDetail, useFileDetail } from "@/lib/use-source"
import { KIND_LABEL, KindIcon } from "./kind-icon"

let openId: string | null = null
const listeners = new Set<() => void>()
/** Opens a file's details (plan F06) from anywhere: a row, the source pane, ⌘K. */
export function openDetails(fileId: string | null) {
  openId = fileId
  for (const l of listeners) l()
}
function useOpenId() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => openId,
    () => null,
  )
}

const FOUND_BY = {
  doi: "Found in OpenAlex by the DOI printed in the file.",
  arxiv: "Found in OpenAlex by its arXiv number.",
  title: "Found in OpenAlex by its title.",
  you: "Edited by you.",
} as const

/** The details sheet: what the file is, its citation record (editable), and its summary. */
export function FileDetailsSheet() {
  const fileId = useOpenId()
  return (
    <Sheet open={Boolean(fileId)} onOpenChange={(open) => !open && openDetails(null)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 border-l border-border bg-panel p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]"
      >
        {fileId && <Details key={fileId} fileId={fileId} />}
      </SheetContent>
    </Sheet>
  )
}

function Details({ fileId }: { fileId: string }) {
  const { data: file, isPending } = useFileDetail(fileId)
  const [editing, setEditing] = useState(false)
  const queryClient = useQueryClient()
  const reprocess = useMutation({
    mutationFn: () => api(`/api/files/${fileId}/reprocess`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Reading it again. It'll be ready in a moment.")
      void queryClient.invalidateQueries({ queryKey: qk.files.all })
      openDetails(null)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (isPending || !file) {
    return (
      <div className="space-y-4 p-6">
        <SheetTitle className="sr-only">File details</SheetTitle>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  const csl = file.meta.csl
  const ready = file.status === "ready"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b border-border p-5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-raised">
          <KindIcon kind={file.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-subhead leading-snug font-normal text-bone-white">
            {file.title}
          </SheetTitle>
          {authorsLine(csl) && (
            <p className="mt-1 text-snippet text-silver-mist">
              {authorsLine(csl)}
              {yearOf(csl) ? ` · ${yearOf(csl)}` : ""}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close details"
          onClick={() => openDetails(null)}
          className="-mt-1 -mr-1 text-ash-gray hover:text-bone-white"
        >
          <XIcon strokeWidth={1.5} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {file.meta.summary && (
          <section aria-labelledby="summary-label">
            <h3
              id="summary-label"
              className="flex items-center gap-1.5 text-micro text-ash-gray uppercase"
            >
              <SparklesIcon className="size-3" strokeWidth={1.75} aria-hidden />
              Summary
            </h3>
            <p className="mt-2 text-ui leading-relaxed text-silver-mist">{file.meta.summary}</p>
            <p className="mt-1.5 text-meta text-ash-gray">Written by a model from this file.</p>
          </section>
        )}

        <section aria-labelledby="citation-label" className="mt-7">
          <div className="flex items-center justify-between">
            <h3 id="citation-label" className="text-micro text-ash-gray uppercase">
              Citation
            </h3>
            {!editing && (
              <Button
                variant="ghost"
                size="sm"
                className="-mr-2 h-7 px-2.5 text-snippet text-ash-gray hover:text-bone-white"
                onClick={() => setEditing(true)}
              >
                <PencilIcon strokeWidth={1.5} />
                Edit
              </Button>
            )}
          </div>
          {editing ? (
            <CitationForm file={file} onDone={() => setEditing(false)} />
          ) : (
            <CitationRows file={file} />
          )}
        </section>

        <HighlightsSection file={file} />

        <section aria-labelledby="file-label" className="mt-7">
          <h3 id="file-label" className="text-micro text-ash-gray uppercase">
            File
          </h3>
          <dl className="mt-2">
            <Row label="Kind">{KIND_LABEL[file.kind]}</Row>
            {file.pageCount ? <Row label="Pages">{file.pageCount}</Row> : null}
            {file.durationSeconds ? (
              <Row label="Length">
                {Math.floor(file.durationSeconds / 60)}:
                {String(Math.round(file.durationSeconds % 60)).padStart(2, "0")}
              </Row>
            ) : null}
            {file.sizeBytes ? <Row label="Size">{formatBytes(file.sizeBytes)}</Row> : null}
            <Row label="Added">
              {new Date(file.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Row>
            {file.sourceUrl && (
              <Row label="From">
                <a
                  href={file.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate text-silver-mist underline decoration-line-strong underline-offset-2 hover:text-bone-white"
                >
                  {new URL(file.sourceUrl).hostname}
                  <ExternalLinkIcon className="size-3 shrink-0" strokeWidth={1.75} />
                </a>
              </Row>
            )}
            {file.meta.licence && (
              <Row label="Licence">
                <span className="block text-silver-mist">
                  <a
                    href={file.meta.licence.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-line-strong underline-offset-2 hover:text-bone-white"
                  >
                    {file.meta.licence.name}
                  </a>
                  <span className="mt-1 block text-meta text-ash-gray">
                    {file.meta.licence.attribution}
                  </span>
                </span>
              </Row>
            )}
            {file.fromScan && (
              <Row label="Text">
                <span className="inline-flex items-center gap-1">
                  <ScanTextIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
                  Read from scanned pages
                </span>
              </Row>
            )}
          </dl>
        </section>
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-border p-4">
        {ready && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              openSource({ fileId: file.id, title: file.title, kind: file.kind })
              openDetails(null)
            }}
          >
            <PanelRightOpenIcon strokeWidth={1.5} />
            Open
          </Button>
        )}
        {file.downloadUrl && (
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<a href={file.downloadUrl} download />}
          >
            <DownloadIcon strokeWidth={1.5} />
            Download
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={reprocess.isPending || file.status === "processing"}
          onClick={() => reprocess.mutate()}
        >
          <RefreshCwIcon strokeWidth={1.5} />
          Re-process
        </Button>
      </footer>
    </div>
  )
}

/** What the person highlighted in this file: jump back to each, or remove it. */
function HighlightsSection({ file }: { file: FileDetail }) {
  const { data: marks } = useHighlights(file.id)
  const { remove } = useHighlightActions(file.id)
  if (!marks?.length) return null
  return (
    <section aria-labelledby="highlights-label" className="mt-7">
      <h3 id="highlights-label" className="text-micro text-ash-gray uppercase">
        Your highlights · {marks.length}
      </h3>
      <ul className="mt-2 space-y-1">
        {marks.map((mark) => (
          <li key={mark.id} className="group flex items-start gap-2 rounded-lg hover:bg-raised">
            <button
              type="button"
              onClick={() => {
                openSource({ fileId: file.id, title: file.title, kind: file.kind, page: mark.page })
                openDetails(null)
              }}
              className="flex min-w-0 flex-1 gap-2.5 px-2 py-2 text-left"
            >
              <span
                className="mt-1 h-3.5 w-0.5 shrink-0 rounded-full bg-particle-blue"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="line-clamp-2 text-snippet text-silver-mist">{mark.text}</span>
                <span className="mt-0.5 block text-meta text-ash-gray">Page {mark.page}</span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Remove highlight"
              onClick={() => remove.mutate(mark.id)}
              className="mt-1.5 mr-1 grid size-6 shrink-0 place-items-center rounded-full text-ash-gray opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/8 hover:text-bone-white focus-visible:opacity-100"
            >
              <XIcon className="size-3.5" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CitationRows({ file }: { file: FileDetail }) {
  const csl = file.meta.csl
  if (!csl) {
    return (
      <p className="mt-2 text-ui text-ash-gray">
        No published record was found for this file. Add its details to cite it.
      </p>
    )
  }
  return (
    <>
      <dl className="mt-2">
        <Row label="Authors">
          {csl.author?.map(personName).join(", ") || <Missing>Add authors</Missing>}
        </Row>
        <Row label="Year">{yearOf(csl) ?? <Missing>Add year</Missing>}</Row>
        <Row label="In">{csl["container-title"] ?? <Missing>Add journal or venue</Missing>}</Row>
        {csl.volume && (
          <Row label="Volume">
            {csl.volume}
            {csl.issue ? ` (${csl.issue})` : ""}
          </Row>
        )}
        {csl.page && <Row label="Pages">{csl.page.replace("-", "–")}</Row>}
        {csl.DOI && (
          <Row label="DOI">
            <a
              href={`https://doi.org/${csl.DOI}`}
              target="_blank"
              rel="noreferrer"
              className="break-all text-silver-mist underline decoration-line-strong underline-offset-2 hover:text-bone-white"
            >
              {csl.DOI}
            </a>
          </Row>
        )}
        {file.meta.openalex && (
          <Row label="Cited by">
            {file.meta.openalex.citedBy.toLocaleString()} work
            {file.meta.openalex.citedBy === 1 ? "" : "s"}
          </Row>
        )}
      </dl>
      {file.meta.foundBy && (
        <p className="mt-2 text-meta text-ash-gray">{FOUND_BY[file.meta.foundBy]}</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 -ml-2.5 h-7 px-2.5 text-snippet text-ash-gray hover:text-bone-white"
        onClick={() => {
          void navigator.clipboard.writeText(toBibtex(csl, file.title))
          toast.success("BibTeX copied")
        }}
      >
        <CopyIcon strokeWidth={1.5} />
        Copy BibTeX
      </Button>
    </>
  )
}

/** Edits are saved as the person's own record and survive a re-process. */
function CitationForm({ file, onDone }: { file: FileDetail; onDone: () => void }) {
  const csl = file.meta.csl
  const [title, setTitle] = useState(file.title)
  const [authors, setAuthors] = useState(csl?.author?.map(personName).join("; ") ?? "")
  const [year, setYear] = useState(String(yearOf(csl) ?? ""))
  const [venue, setVenue] = useState(csl?.["container-title"] ?? "")
  const [doi, setDoi] = useState(csl?.DOI ?? "")
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => {
      const next: CslItem = {
        type: csl?.type ?? "article",
        title,
        author: authors
          .split(/;|\n/)
          .map((a) => a.trim())
          .filter(Boolean)
          .map((a) => {
            const parts = a.split(/\s+/)
            return parts.length > 1
              ? { family: parts.at(-1), given: parts.slice(0, -1).join(" ") }
              : { literal: a }
          }),
        issued: /^\d{4}$/.test(year.trim()) ? { "date-parts": [[Number(year)]] } : undefined,
        "container-title": venue.trim() || undefined,
        DOI: doi.trim().replace(/^https?:\/\/doi\.org\//i, "") || undefined,
      }
      return api(`/api/files/${file.id}`, { method: "PATCH", json: { title, csl: next } })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.files.all })
      toast.success("Details saved")
      onDone()
    },
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Field label="Title" value={title} onChange={setTitle} required />
      <Field label="Authors" hint="Separate names with ;" value={authors} onChange={setAuthors} />
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Year" value={year} onChange={setYear} inputMode="numeric" />
        <Field label="Journal or venue" value={venue} onChange={setVenue} />
      </div>
      <Field label="DOI" value={doi} onChange={setDoi} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  ...props
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-meta text-ash-gray">
        {label}
        {hint && <span className="ml-1.5 text-ash-gray/70">{hint}</span>}
      </label>
      <Input
        {...props}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 rounded-lg"
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-1.5">
      <dt className="text-snippet text-ash-gray">{label}</dt>
      <dd className="min-w-0 text-snippet text-silver-mist">{children}</dd>
    </div>
  )
}

const Missing = ({ children }: { children: React.ReactNode }) => (
  <span className="text-ash-gray/70">{children}</span>
)

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
