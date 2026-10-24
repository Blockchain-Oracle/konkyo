"use client"

import { Button } from "@konkyo/ui/components/button"
import { tiltFor } from "@konkyo/ui/lib/space"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { CSSProperties } from "react"
import { FileStatus } from "@/components/library/file-status"
import { KIND_LABEL } from "@/components/library/kind-icon"
import { SourceFace } from "@/components/library/source-face"
import { SpaceShelf } from "@/components/library/space-shelf"
import { useUploads } from "@/components/library/uploads-provider"
import { RoomHeader } from "@/components/page-shell"
import { AddPicker } from "@/components/shell/add-picker"
import { openNewFolder } from "@/components/shell/app-dialogs"
import { TodayCard } from "@/components/study/today-card"
import { authClient } from "@/lib/auth-client"
import { WHOLE_LIBRARY } from "@/lib/focus"
import { holdQuestion } from "@/lib/pending-question"
import { openFile } from "@/lib/preview"
import { sound } from "@/lib/sounds"
import { sortChats, useChats } from "@/lib/use-chats"
import type { LibraryFile } from "@/lib/use-library"
import { useFiles } from "@/lib/use-library"
import { useSpaceList } from "@/lib/use-spaces"
import { useSuggestions } from "@/lib/use-suggestions"
import { HomeComposer } from "./home-composer"

const NOTE_TONES = ["violet", "pink", "teal", "cobalt"] as const
const DOODLES = ["✦", "?", "☾", "✿"]

/**
 * Home is a room (OurSpaces' space, on the blush wall): your name huge, black sticker counts, and
 * a board of paper objects that arranges itself — the ask sheet, today's review pinned beside it,
 * your spaces as folders holding their real first pages, questions your sources can answer as torn
 * notes, what landed last, and the chats to pick up again.
 */
export function HomeRoom() {
  const { data: session } = authClient.useSession()
  const { data: files } = useFiles()
  const { data: spaces } = useSpaceList()
  const { pickFiles } = useUploads()
  const user = session?.user as { name?: string; isAnonymous?: boolean } | undefined
  const first = user && !user.isAnonymous ? user.name?.trim().split(/\s+/)[0] : undefined
  const needYou = files?.filter((f) => f.status === "needs_you").length ?? 0

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 pb-32 md:px-8 md:pt-[92px]">
      <RoomHeader
        title={first ? `${first.toLowerCase()}'s library` : "your library"}
        kicker={
          files ? (
            <>
              <b>{files.length}</b> sources · {spaces?.length ?? 0} spaces
              {needYou ? ` · ${needYou} need you` : ""}
            </>
          ) : (
            "your library"
          )
        }
        actions={
          <>
            <Button variant="sticker" onClick={() => openNewFolder(null)}>
              new space
            </Button>
            <AddPicker />
          </>
        }
      />

      <div className="board">
        <section aria-label="Ask" className="board-area-ask board-object">
          <div className="surface-paper board-sheet">
            <span className="board-tape" aria-hidden />
            <p className="text-[12px] font-extrabold text-ink-muted">ask your library</p>
            <h2 className="mt-1.5 font-display text-[clamp(1.9rem,1.4rem+1.4vw,2.6rem)] leading-[0.98] font-extrabold tracking-[-0.03em] text-ink lowercase">
              what do you want to know?
            </h2>
            <HomeComposer />
          </div>
        </section>

        <div className="board-area-side grid grid-cols-[minmax(0,1fr)] content-start gap-10 pt-2">
          <TodayCard pinned className="board-sticker-card rounded-[20px] border-0" />
          <Chats />
        </div>

        <div className="board-area-spaces">
          <SpaceShelf width={260} />
        </div>
        <Notes ready={files?.some((f) => f.status === "ready") ?? false} />
        <Recent files={files} />
      </div>
    </div>
  )
}

/** Questions your sources can answer, as torn paper notes; tap one and it's asked. */
function Notes({ ready }: { ready: boolean }) {
  const router = useRouter()
  const { data: questions } = useSuggestions(WHOLE_LIBRARY, ready)
  if (!ready || !questions?.length) return null
  const ask = (text: string) => {
    sound("place")
    const chatId = crypto.randomUUID()
    holdQuestion(chatId, { text, focus: WHOLE_LIBRARY })
    router.push(`/chats/${chatId}` as Route)
  }
  return (
    <section aria-label="Try asking" className="board-area-notes">
      <div className="board-label">
        <span className="room-pill">try asking · from your sources</span>
      </div>
      <div className="board-notes">
        {questions.slice(0, 4).map((question, i) => (
          <button
            key={question}
            type="button"
            onClick={() => ask(question)}
            className={`board-note board-object tone-${NOTE_TONES[i % NOTE_TONES.length]}`}
            style={{ rotate: tiltFor(question, 260) } as CSSProperties}
          >
            <span className="note-paper-backing" aria-hidden />
            <span className="note-paper-sheet">
              <span className="note-kicker">a question your library can answer</span>
              <span className="note-text">{question}</span>
              <span className="note-footer">
                <span className="note-author">— checked against your sources</span>
                <span className="note-go">ask ↗</span>
              </span>
            </span>
            <span className="note-paper-tape" aria-hidden />
            <span className="note-paper-doodle" aria-hidden>
              {DOODLES[i % DOODLES.length]}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

/** What landed last: each with its real first page, on a sheet of paper. */
function Recent({ files }: { files: LibraryFile[] | undefined }) {
  const router = useRouter()
  if (!files?.length) return null
  return (
    <section aria-label="Recently added" className="board-area-recent board-object">
      <div className="board-label">
        <span className="room-pill">just landed</span>
        <Link href="/library" className="room-pill hover:bg-ink">
          all {files.length} ↗
        </Link>
      </div>
      <div className="surface-paper board-sheet px-4 pt-3 pb-3">
        <ul>
          {files.slice(0, 5).map((file, i) => (
            <li key={file.id} className={i === 0 ? "[&>*]:border-t-0" : undefined}>
              <button
                type="button"
                disabled={file.status !== "ready"}
                onClick={() => openFile(file, (href) => router.push(href as Route))}
                className="board-row w-full disabled:cursor-default"
              >
                <SourceFace file={file} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {file.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">
                    {KIND_LABEL[file.kind]} · {shortDate(file.createdAt)}
                    {file.folderName ? ` · ${file.folderName}` : ""}
                  </span>
                </span>
                {file.status !== "ready" && <FileStatus file={file} />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** The chats to pick up again, on a black sticker card. */
function Chats() {
  const { data: chats } = useChats()
  if (!chats?.length) return null
  return (
    <section aria-label="Keep going" className="board-object">
      <div className="board-label">
        <span className="room-pill">keep going</span>
        <Link href="/chats" className="room-pill hover:bg-ink">
          all chats ↗
        </Link>
      </div>
      <ul className="surface-sticker board-sticker-card overflow-hidden p-2">
        {sortChats(chats)
          .slice(0, 4)
          .map((chat) => (
            <li key={chat.id}>
              <Link
                href={`/chats/${chat.id}` as Route}
                onClick={() => sound("tap")}
                className="flex items-center gap-3 rounded-[14px] px-3.5 py-3 transition-colors duration-(--dur-quick) hover:bg-white/8"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
                  {chat.title}
                </span>
                <span className="shrink-0 text-[12px] text-room-muted">
                  {shortDate(chat.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  )
}
