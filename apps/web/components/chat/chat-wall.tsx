"use client"

import type { Citation, KonkyoMessage, SourceRef } from "@konkyo/agents"
import type { FileKind } from "@konkyo/config"
import { tiltFor } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import { type CSSProperties, useState } from "react"
import { SourceFace } from "@/components/library/source-face"
import { partsOf } from "@/lib/message-parts"
import { openSource } from "@/lib/preview"

type WallSource = {
  fileId: string
  title: string
  kind: string
  /** The citation numbers that point here, one per citation, across every answer. */
  cited: number[]
  pages: number[]
  reading: boolean
}

/** Every source this chat has cited, newest answer first; the one being read now on top. */
function wallOf(messages: KonkyoMessage[], running: boolean) {
  const byFile = new Map<string, WallSource>()
  const add = (ref: SourceRef | Citation, extra: Partial<WallSource>) => {
    const was = byFile.get(ref.fileId)
    const next: WallSource = was ?? {
      fileId: ref.fileId,
      title: ref.title,
      kind: ref.kind,
      cited: [],
      pages: [],
      reading: false,
    }
    if (extra.cited) next.cited.push(...extra.cited)
    if (extra.reading) next.reading = true
    if (ref.page != null && !next.pages.includes(ref.page)) next.pages.push(ref.page)
    byFile.set(ref.fileId, next)
  }
  const answers = messages.filter((m) => m.role === "assistant")
  answers.forEach((message, i) => {
    const { sources, final } = partsOf(message)
    const live = running && i === answers.length - 1
    if (final) for (const c of final.citations) add(c, { cited: [c.n] })
    // While an answer is being written, the passages it's reading light up first; once it's final, only what it cited stays.
    else if (live) for (const s of sources) add(s, { reading: true })
  })
  return [...byFile.values()].sort((a, b) => Number(b.reading) - Number(a.reading))
}

/**
 * The chat's wall: each source the answers
 * quote, as a paper card with its real first page. A source being read now rings lime and pulses;
 * pointing at a citation chip lights its card; a card opens the source beside the chat.
 */
export function ChatWall({
  messages,
  running,
  lit,
}: {
  messages: KonkyoMessage[]
  running: boolean
  lit: string | null
}) {
  const sources = wallOf(messages, running)
  const reading = sources.some((s) => s.reading)
  return (
    <aside aria-label="Sources in this chat" className="chat-wall">
      <div className="board-label">
        <span className="room-pill">
          {reading ? (
            <>
              <b>reading</b> {sources.length} sources
            </>
          ) : (
            <>
              <b>{sources.length}</b> source{sources.length === 1 ? "" : "s"} quoted
            </>
          )}
        </span>
      </div>
      {sources.length ? (
        <ul className="grid gap-7 pt-2">
          {sources.map((source) => (
            <li key={source.fileId}>
              <WallCard source={source} lit={lit === source.fileId} />
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="board-note board-object tone-violet cursor-default"
          style={{ rotate: "-1.2deg" } as CSSProperties}
        >
          <span className="note-paper-backing" aria-hidden />
          <span className="note-paper-sheet min-h-0!">
            <span className="note-kicker">your wall</span>
            <span className="note-text text-[17px]!">
              Every passage an answer quotes lands here, with its page, so you can open it.
            </span>
          </span>
          <span className="note-paper-tape" aria-hidden />
        </div>
      )}
    </aside>
  )
}

function WallCard({ source, lit }: { source: WallSource; lit: boolean }) {
  const [thumbGone, setThumbGone] = useState(false)
  // Each answer numbers its own citations, so across a chat the rail counts them instead.
  const times = source.cited.length
  return (
    <button
      type="button"
      onClick={() =>
        openSource({
          fileId: source.fileId,
          title: source.title,
          kind: source.kind as Parameters<typeof openSource>[0]["kind"],
        })
      }
      className={cn("chat-source board-object", lit && "is-lit", source.reading && "is-reading")}
      style={{ rotate: tiltFor(source.fileId, 320) } as CSSProperties}
    >
      <span className="photo-tape" aria-hidden />
      <span className="chat-source-page" aria-hidden>
        {thumbGone ? (
          <SourceFace
            file={{ id: source.fileId, kind: source.kind as FileKind, hasThumb: false }}
          />
        ) : (
          // biome-ignore lint/performance/noImgElement: same-origin webp thumbs, already sized
          <img
            src={`/api/files/${source.fileId}/thumb`}
            alt=""
            loading="lazy"
            onError={() => setThumbGone(true)}
          />
        )}
      </span>
      <span className="chat-source-text">
        <span className="chat-source-title">{source.title}</span>
        <span className="chat-source-meta">
          {source.reading
            ? "reading…"
            : `cited ${times === 1 ? "once" : `${times} times`}${
                source.pages.length
                  ? ` · p. ${source.pages
                      .sort((a, b) => a - b)
                      .slice(0, 4)
                      .join(", ")}`
                  : ""
              }`}
        </span>
      </span>
    </button>
  )
}
