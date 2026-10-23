"use client"

import { Button } from "@konkyo/ui/components/button"
import { ArrowRightIcon, LinkIcon, UploadIcon } from "lucide-react"
import Link from "next/link"
import { EmptyState } from "@/components/empty-state"
import { FileStatus } from "@/components/library/file-status"
import { KIND_LABEL, KindIcon } from "@/components/library/kind-icon"
import { openSource } from "@/lib/preview"
import { useFiles } from "@/lib/use-library"

const RECENT = 5

/** Home's library block: what was added last (each opens beside the chat), or how to start. */
export function HomeLibrary() {
  const { data: files, isPending } = useFiles()
  if (isPending) return null // the block is below the fold of the composer; no skeleton flash
  if (!files?.length) {
    return (
      <EmptyState
        label="Your library"
        title="Nothing here yet"
        description="Upload files or a whole folder, or import a paper by its DOI. Every answer will point to the exact passage it came from."
      >
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/library" />} nativeButton={false} variant="secondary">
            <UploadIcon strokeWidth={1.5} />
            Upload files
          </Button>
          <Button render={<Link href="/library" />} nativeButton={false} variant="ghost">
            <LinkIcon strokeWidth={1.5} />
            Import by URL or DOI
          </Button>
        </div>
      </EmptyState>
    )
  }
  return (
    <section aria-labelledby="home-library">
      <div className="flex items-baseline justify-between">
        <h2 id="home-library" className="text-micro text-saffron-spark uppercase">
          Recently added
        </h2>
        <Link
          href="/library"
          className="inline-flex items-center gap-1 text-snippet text-ash-gray transition-colors duration-(--duration-press) hover:text-bone-white"
        >
          All {files.length} files
          <ArrowRightIcon className="size-3.5" strokeWidth={1.5} />
        </Link>
      </div>
      <ul className="mt-3 border-t border-border">
        {files.slice(0, RECENT).map((file) => (
          <li
            key={file.id}
            className="relative flex h-13 items-center gap-3 border-b border-border px-1 transition-colors duration-(--duration-press) hover:bg-panel"
          >
            <KindIcon kind={file.kind} className="shrink-0" />
            {file.status === "ready" ? (
              <button
                type="button"
                onClick={() => openSource({ fileId: file.id, title: file.title, kind: file.kind })}
                className="min-w-0 flex-1 truncate text-left text-ui text-bone-white after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-1 focus-visible:after:ring-silver-mist"
              >
                {file.title}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-ui text-silver-mist">{file.title}</span>
            )}
            <span className="hidden shrink-0 text-meta text-ash-gray sm:inline">
              {KIND_LABEL[file.kind]}
            </span>
            {file.status !== "ready" && <FileStatus file={file} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
