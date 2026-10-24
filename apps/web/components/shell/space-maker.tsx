"use client"

import { SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"
import { useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"

/*
 * Make a space (plan F45): OurSpaces' SpaceMaker (MIT), ported. Pick a starting point, name it on
 * the little board, change its colour, wall and symbol under "customize", and choose the pieces
 * it starts with. Every piece is real: finding sources runs a deep search that files what it finds
 * into the new space, a watch is a weekly agent, a quiz is a Monday agent. Styles: house.css.
 */

type Piece = "find" | "watch" | "quiz"

const PIECES: Record<Piece, { label: string; mini: React.ReactNode }> = {
  find: {
    label: "find sources on it",
    mini: (
      <span className="mini-check">
        <span className="is-done" />
        <span className="is-done" />
        <span />
      </span>
    ),
  },
  watch: {
    label: "watch for new papers",
    mini: (
      <span className="mini-count">
        <strong>+3</strong>
        <span>this week</span>
      </span>
    ),
  },
  quiz: {
    label: "quiz me on mondays",
    mini: (
      <span className="mini-q">
        <strong>Q</strong>
        <span>
          <i />
          <i />
        </span>
      </span>
    ),
  },
}

export type Template = {
  id: string
  name: string
  color: SpaceColor
  symbol: string
  pieces: Piece[]
  line: string
}

export const TEMPLATES: Template[] = [
  {
    id: "exam",
    name: "exam prep",
    color: "orange",
    symbol: "✎",
    pieces: ["quiz", "find"],
    line: "your course readings, a quiz every monday",
  },
  {
    id: "essay",
    name: "essay or IA",
    color: "violet",
    symbol: "✦",
    pieces: ["find"],
    line: "sources for one argument, every quote checked",
  },
  {
    id: "review",
    name: "literature review",
    color: "cobalt",
    symbol: "◎",
    pieces: ["find", "watch"],
    line: "the papers on a question, and new ones as they land",
  },
  {
    id: "group",
    name: "reading group",
    color: "pink",
    symbol: "☾",
    pieces: [],
    line: "one book or paper a week, read together",
  },
]
const EMPTY: Template = {
  id: "empty",
  name: "a new space",
  color: "teal",
  symbol: "◐",
  pieces: [],
  line: "",
}

/** Where the starting pieces land on the little board (OurSpaces' SLOTS_THREE). */
const SLOTS = [
  { left: 5, top: 30, width: 32, tilt: -2 },
  { left: 38, top: 54, width: 30, tilt: 1.6 },
  { left: 65, top: 28, width: 31, tilt: -1.3 },
]

export function SpaceMaker({
  open,
  template,
  onClose,
}: {
  open: boolean
  /** Opens on this template (first-run Home's chooser); otherwise on the first. */
  template?: string
  onClose: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [picked, setPicked] = useState<Template>(
    [...TEMPLATES, EMPTY].find((t) => t.id === template) ?? TEMPLATES[0] ?? EMPTY,
  )
  const [color, setColor] = useState<SpaceColor>(picked.color)
  const [wall, setWall] = useState<SpaceWall | null>(null)
  const [symbol, setSymbol] = useState(picked.symbol)
  const [pieces, setPieces] = useState<Piece[]>(picked.pieces)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) dialog.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  const pick = (template: Template) => {
    sound("tap")
    setPicked(template)
    setColor(template.color)
    setWall(null)
    setSymbol(template.symbol)
    setPieces(template.pieces)
  }

  const hex = SPACES.colors[color].hex
  const chosenWall = wall ?? (SPACES.defaultWall[color] as SpaceWall)
  const shownName = name.trim() || picked.name

  const make = async () => {
    if (busy) return
    setBusy(true)
    const spaceName = shownName
    try {
      const { id } = await api<{ id: string }>("/api/spaces", {
        method: "POST",
        json: {
          name: spaceName,
          color,
          wall: chosenWall,
          symbol,
          templateId: picked.id,
          description: picked.line || undefined,
        },
      })
      const scope = { fileIds: [], folderIds: [id] }
      // The starting pieces, for real.
      const started: string[] = []
      if (pieces.includes("watch"))
        await api("/api/agents", {
          method: "POST",
          json: {
            name: `New papers on ${spaceName}`,
            kind: "watch",
            instructions: spaceName,
            scope,
            schedule: { every: "week", weekday: 1, hour: 9 },
          },
        }).then(() => started.push("a weekly watch"))
      if (pieces.includes("quiz"))
        await api("/api/agents", {
          method: "POST",
          json: {
            name: `Quiz on ${spaceName}`,
            kind: "quiz",
            instructions: "",
            scope,
            schedule: { every: "week", weekday: 1, hour: 8 },
          },
        }).then(() => started.push("a Monday quiz"))
      if (pieces.includes("find")) {
        const chatId = crypto.randomUUID()
        const question = `Find sources on ${spaceName}`
        await api("/api/deep", {
          method: "POST",
          json: {
            chatId,
            question,
            message: {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: question }],
            },
            intoFolderId: id,
            scope,
          },
        }).then(() => {
          started.push("a search for sources")
          toast(`Finding sources on ${spaceName}`, {
            description: "What it finds lands on this wall.",
            action: { label: "Watch it", onClick: () => router.push(`/chats/${chatId}` as Route) },
          })
        })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: qk.spaces.list() }),
        queryClient.invalidateQueries({ queryKey: ["folders"] }),
        queryClient.invalidateQueries({ queryKey: ["agents"] }),
      ])
      sound("place")
      if (started.length && !pieces.includes("find"))
        toast(`${spaceName} is ready`, { description: `Started ${started.join(" and ")}.` })
      onClose()
      router.push(`/spaces/${id}` as Route)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // As OurSpaces does: nothing in the page while closed (the backdrop's own display rule would
  // otherwise override the hidden state of a closed <dialog>).
  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="widget-picker-backdrop space-maker-backdrop"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div
        className="widget-picker space-maker is-build"
        style={{ "--maker-color": hex, "--maker-ink": readableInk(hex) } as CSSProperties}
        role="document"
        aria-label="Make a space"
      >
        <header>
          <div>
            <h2>a space for one question</h2>
            <p>pick a starting point. change anything later.</p>
          </div>
          <button
            type="button"
            className="widget-picker-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <ul className="space-maker-shapes">
          {[...TEMPLATES, EMPTY].map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className={template.id === picked.id ? "is-picked" : ""}
                disabled={busy}
                onClick={() => pick(template)}
              >
                <span aria-hidden="true">{`${template.symbol}︎`}</span>
                {template.id === "empty" ? "start empty" : template.name}
              </button>
            </li>
          ))}
        </ul>

        {/* The new space at postage-stamp size; keyed so the pieces re-land on every pick. */}
        <div className="space-maker-board" key={picked.id + pieces.join()}>
          <div className="space-maker-board-head">
            <span className="space-maker-board-icon">{`${symbol}︎`}</span>
            <input
              className="space-maker-board-name"
              value={name}
              maxLength={60}
              placeholder={picked.name}
              disabled={busy}
              aria-label="Name your space"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                void make()
              }}
            />
            <span className="space-maker-board-pencil" aria-hidden="true">
              ✎
            </span>
          </div>
          {pieces.map((piece, i) => {
            const slot = SLOTS[i % SLOTS.length] ?? SLOTS[0]
            return (
              <div
                key={piece}
                className="space-maker-tile"
                style={
                  {
                    "--i": i,
                    "--tilt": `${slot?.tilt ?? 0}deg`,
                    left: `${slot?.left ?? 0}%`,
                    top: `${slot?.top ?? 0}%`,
                    width: `${slot?.width ?? 30}%`,
                  } as CSSProperties
                }
              >
                <span className="space-maker-tile-label">{PIECES[piece].label}</span>
                {PIECES[piece].mini}
              </div>
            )
          })}
          {pieces.length === 0 && (
            <span className="space-maker-empty">
              {picked.line || "a little room for whatever you read next."}
            </span>
          )}
          {busy && <span className="join-stamp space-maker-stamp">yours</span>}
        </div>

        <div className="space-maker-body">
          <details className="space-maker-custom">
            <summary>
              <span>
                customize <span className="space-maker-custom-chevron">⌄</span>
              </span>
              <span className="space-maker-custom-summary">
                colour, wall, symbol & what it starts with
              </span>
            </summary>
            <div className="space-maker-custom-options">
              <div className="space-maker-custom-row">
                <span className="space-maker-custom-label">colour</span>
                <span className="space-maker-swatches">
                  {(Object.keys(SPACES.colors) as SpaceColor[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={c === color ? "is-picked" : ""}
                      style={{ background: SPACES.colors[c].hex }}
                      aria-label={c}
                      aria-pressed={c === color}
                      onClick={() => {
                        sound("tap")
                        setColor(c)
                      }}
                    />
                  ))}
                </span>
              </div>
              <div className="space-maker-custom-row">
                <span className="space-maker-custom-label">wall</span>
                <span className="space-maker-swatches">
                  {(Object.keys(SPACES.walls) as SpaceWall[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={w === chosenWall ? "is-picked" : ""}
                      style={{ background: SPACES.walls[w].bg }}
                      aria-label={`${w} wall`}
                      aria-pressed={w === chosenWall}
                      onClick={() => {
                        sound("tap")
                        setWall(w)
                      }}
                    />
                  ))}
                </span>
              </div>
              <div className="space-maker-custom-row">
                <span className="space-maker-custom-label">symbol</span>
                <span className="space-maker-marks">
                  {SPACES.symbols.map((mark) => (
                    <button
                      key={mark}
                      type="button"
                      className={mark === symbol ? "is-picked" : ""}
                      aria-pressed={mark === symbol}
                      onClick={() => setSymbol(mark)}
                    >
                      {`${mark}︎`}
                    </button>
                  ))}
                </span>
              </div>
              <div className="space-maker-custom-row">
                <span className="space-maker-custom-label">starts with</span>
                <span className="space-maker-types">
                  {(Object.keys(PIECES) as Piece[]).map((piece) => {
                    const on = pieces.includes(piece)
                    return (
                      <button
                        key={piece}
                        type="button"
                        className={on ? "is-on" : ""}
                        aria-pressed={on}
                        disabled={busy}
                        onClick={() =>
                          setPieces((prev) =>
                            on ? prev.filter((p) => p !== piece) : [...prev, piece],
                          )
                        }
                      >
                        <span aria-hidden="true">{on ? "✓" : "+"}</span>
                        {PIECES[piece].label}
                      </button>
                    )
                  })}
                </span>
              </div>
            </div>
          </details>

          <div className="space-maker-foot">
            <span className="space-maker-hint">
              {busy ? "setting the space up…" : picked.line || "make it yours as you go."}
            </span>
            <button
              type="button"
              className="claim-done"
              disabled={busy}
              onClick={() => void make()}
            >
              {busy ? "making…" : "make the space"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
