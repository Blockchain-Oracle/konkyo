"use client"

import type { Route } from "next"
import Link from "next/link"
import { clock } from "@/lib/format"
import { useFolderBriefs } from "@/lib/use-briefs"

/** A folder's audio briefs as a row above its files (plan F37), so they're found where they're about. */
export function FolderBriefs({ folderId }: { folderId: string }) {
  const { data: briefs } = useFolderBriefs(folderId)
  const shown = (briefs ?? []).filter((b) => b.status !== "failed").slice(0, 3)
  if (!shown.length) return null
  return (
    <ul className="mt-6 flex flex-wrap gap-2" aria-label="Audio briefs">
      {shown.map((b) => (
        <li key={b.id}>
          <Link
            href={`/briefs/${b.id}` as Route}
            className="inline-flex h-9 max-w-80 items-center gap-2 rounded-full border border-border bg-panel pr-3.5 pl-3 text-snippet text-silver-mist transition-colors duration-(--duration-press) hover:border-line-strong hover:text-bone-white"
          >
            <span aria-hidden className="shrink-0 text-[11px] text-lime">
              ▶
            </span>
            <span className="truncate">{b.title}</span>
            <span className="shrink-0 text-ash-gray tabular-nums">
              {b.status === "making"
                ? "making…"
                : b.durationSeconds
                  ? clock(b.durationSeconds)
                  : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
