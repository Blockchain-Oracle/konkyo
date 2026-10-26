"use client"

import { Button } from "@konkyo/ui/components/button"
import { useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useUploads } from "@/components/library/uploads-provider"
import { api } from "@/lib/fetcher"
import { holdQuestion } from "@/lib/pending-question"
import { sound } from "@/lib/sounds"
import { useMakeBrief } from "@/lib/use-briefs"
import { useStudyActions } from "@/lib/use-study"
import { openConnectorImport, openImport, openRecorder } from "./app-dialogs"

/*
 * "Add to this space" (plan F60): the add tray (markup and CSS in house.css),
 * with one tile per way something gets into Konkyo. Each tile is drawn as the thing it makes, or
 * the service's own logo, never an icon, and each runs the real thing: the file picker, the URL
 * import, a recording made here, a deep search filed here, a note filed here, the Gmail/Drive/
 * Notion import, the space's email address, practice, an audio brief, a weekly watch. Without a
 * space it adds to the whole library.
 */

type Tile = {
  id: string
  label: string
  line: string
  art: React.ReactNode
  /** Only inside a space (it needs sources or a place to file into). */
  spaceOnly?: boolean
  run: () => void | Promise<void>
}

const logo = (src: string) => (
  <span className="add-art">
    {/* biome-ignore lint/performance/noImgElement: a small static logo */}
    <img src={src} alt="" />
  </span>
)

export function AddPicker({ folderId, name }: { folderId?: string; name?: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { pickFiles, pickFolder } = useUploads()
  const study = useStudyActions()
  const makeBrief = useMakeBrief()

  // A dialog: focus goes to the first way in, Escape closes it, and focus returns to "add".
  const trigger = useRef<HTMLButtonElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    tray.current?.querySelector<HTMLButtonElement>(".widget-picker-grid button")?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return setOpen(false)
      // Tab goes round the tray, never behind it
      if (event.key !== "Tab" || !tray.current) return
      const stops = [...tray.current.querySelectorAll<HTMLElement>("button")]
      const [first, last] = [stops[0], stops.at(-1)]
      if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
        event.preventDefault()
        ;(event.shiftKey ? last : first)?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    const back = trigger.current
    return () => {
      window.removeEventListener("keydown", onKey)
      back?.focus()
    }
  }, [open])

  const scope = { fileIds: [], folderIds: folderId ? [folderId] : [] }
  const topic = name ?? "my library"

  const tiles: Tile[] = [
    {
      id: "files",
      label: "upload files",
      line: "PDFs, Word, slides, Markdown, recordings",
      art: (
        <span className="add-art add-art-pages">
          <i />
          <i />
          <i>pdf</i>
        </span>
      ),
      run: () => pickFiles(folderId),
    },
    {
      id: "folder",
      label: "upload a folder",
      line: "everything inside it, folders kept",
      art: (
        <span className="add-art add-art-folder">
          <i />
        </span>
      ),
      run: () => pickFolder(folderId),
    },
    {
      id: "link",
      label: "a link or DOI",
      line: "a paper, an article, any web page",
      art: (
        <span className="add-art add-art-doi">
          <span>
            doi:
            <br />
            10.1038
          </span>
        </span>
      ),
      run: () => openImport(folderId),
    },
    {
      id: "youtube",
      label: "a YouTube video",
      line: "its transcript, timed to the video",
      art: logo("/logos/youtube.svg"),
      run: () => openImport(folderId),
    },
    {
      id: "record",
      label: "record a lecture",
      line: "transcribed, every moment citable",
      art: (
        <span className="add-art add-art-rec">
          <i />
          rec
        </span>
      ),
      run: () => openRecorder(folderId),
    },
    {
      id: "find",
      label: "find sources",
      line: `open papers on ${topic}, filed here`,
      art: (
        <span className="add-art add-art-count">
          +12<small>papers</small>
        </span>
      ),
      run: () => {
        const chatId = crypto.randomUUID()
        holdQuestion(chatId, {
          text: `Find more sources on ${topic}`,
          deep: true,
          focus: scope,
          intoFolderId: folderId,
        })
        router.push(`/chats/${chatId}` as Route)
      },
    },
    {
      id: "note",
      label: "a new note",
      line: "write with your sources beside you",
      art: (
        <span className="add-art add-art-note">
          <i />
        </span>
      ),
      run: async () => {
        const { id } = await api<{ id: string }>("/api/notes", {
          method: "POST",
          json: { title: name ? `Notes on ${name}` : "Untitled note", folderId },
        })
        sound("place")
        void queryClient.invalidateQueries({ queryKey: ["notes"] })
        router.push(`/write/${id}` as Route)
      },
    },
    {
      id: "gmail",
      label: "from Gmail",
      line: "emails and their attachments",
      art: logo("/logos/gmail.svg"),
      run: () => openConnectorImport({ folderId }),
    },
    {
      id: "drive",
      label: "from Drive",
      line: "docs, slides and PDFs",
      art: logo("/logos/drive.svg"),
      run: () => openConnectorImport({ folderId }),
    },
    {
      id: "notion",
      label: "from Notion",
      line: "pages, as they are",
      art: logo("/logos/notion.svg"),
      run: () => openConnectorImport({ folderId }),
    },
    {
      id: "email",
      label: "email this space",
      line: "forward papers to its own address",
      spaceOnly: true,
      art: (
        <span className="add-art add-art-mail">
          <i />
        </span>
      ),
      run: async () => {
        const { address } = await api<{ address: string }>(`/api/spaces/${folderId}/address`)
        await navigator.clipboard.writeText(address).catch(() => {})
        toast(`Forward papers to ${address}`, {
          description:
            "Copied. Attachments from you or anyone who can add land on the wall; mail from others waits in your inbox.",
        })
      },
    },
    {
      id: "practice",
      label: "make practice",
      line: "questions checked against these sources",
      spaceOnly: true,
      art: (
        <span className="add-art">
          <span className="mini-q">
            <strong>Q</strong>
            <span>
              <i />
              <i />
            </span>
          </span>
        </span>
      ),
      run: () => void study.quizMe(scope, topic, (href) => router.push(href)),
    },
    {
      id: "brief",
      label: "an audio brief",
      line: "two voices, every claim from here",
      spaceOnly: true,
      art: (
        <span className="add-art add-art-wave">
          {[12, 22, 30, 18, 26, 10, 20].map((h, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a static drawing
            <i key={i} style={{ height: h }} />
          ))}
        </span>
      ),
      run: () => {
        if (folderId) makeBrief.mutate(folderId)
      },
    },
    {
      id: "watch",
      label: "watch for new papers",
      line: "a weekly agent, finds go to your inbox",
      spaceOnly: true,
      art: (
        <span className="add-art add-art-count">
          +3<small>this week</small>
        </span>
      ),
      run: async () => {
        await api("/api/agents", {
          method: "POST",
          json: {
            name: `New papers on ${topic}`,
            kind: "watch",
            instructions: topic,
            scope,
            schedule: { every: "week", weekday: 1, hour: 9 },
          },
        })
        void queryClient.invalidateQueries({ queryKey: ["agents"] })
        toast(`Watching for new papers on ${topic}`, {
          description: "Weekly, Mondays at 9. What it finds goes to your inbox.",
        })
      },
    },
  ].filter((tile) => !tile.spaceOnly || folderId)

  return (
    <>
      <Button
        ref={trigger}
        onClick={() => {
          sound(open ? "tap" : "promote")
          setOpen(!open)
        }}
        aria-expanded={open}
      >
        <span aria-hidden className="text-[16px] leading-none">
          +
        </span>
        add
      </Button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop closes on a press outside
        <div
          className="widget-picker-backdrop widget-picker-backdrop-popover"
          // a press on the backdrop itself, not one inside the tray
          onClick={(event) => event.target === event.currentTarget && setOpen(false)}
          onKeyDown={undefined}
          role="presentation"
        >
          <div
            className="widget-picker widget-picker-popover widget-picker-tray is-browsing"
            ref={tray}
            role="dialog"
            aria-modal="true"
            aria-label={folderId ? "Add to this space" : "Add to your library"}
          >
            <header>
              <div>
                <h2>{folderId ? "add to this space" : "add to your library"}</h2>
                <p>Every source is read, checked into Zetaris and ready to cite.</p>
              </div>
              <button
                type="button"
                className="widget-picker-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="widget-picker-content">
              <div className="widget-picker-section-heading">
                <h3>bring something in</h3>
                <span>it lands on the wall as it's read</span>
              </div>
              <ul className="widget-picker-grid">
                {tiles.map((tile) => (
                  <li key={tile.id}>
                    <button
                      type="button"
                      onClick={() => {
                        sound("tap")
                        setOpen(false)
                        Promise.resolve(tile.run()).catch((error: Error) =>
                          toast.error(error.message),
                        )
                      }}
                    >
                      <span className="widget-picker-art">{tile.art}</span>
                      <span className="widget-picker-copy">
                        <span className="widget-picker-label">{tile.label}</span>
                        <span className="widget-picker-description">{tile.line}</span>
                      </span>
                      <span className="widget-picker-tile-add" aria-hidden="true">
                        +
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
