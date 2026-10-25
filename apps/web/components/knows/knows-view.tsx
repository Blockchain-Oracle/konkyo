"use client"

import type { FileKind } from "@konkyo/config"
import { deepen } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import Link from "next/link"
import { type CSSProperties, useState } from "react"
import { toast } from "sonner"
import { useRoomWall } from "@/components/shell/wall"
import { api } from "@/lib/fetcher"
import type { Knows, KnowsClaim } from "@/lib/knows"
import { openSource } from "@/lib/preview"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"
import { type MemoryItem, useMemoryActions } from "@/lib/use-memories"
import { useQuery } from "@/lib/use-query"

const TOLD_CHARS = 240
const STANCE_WORD = { agrees: "agrees", partly: "partly", disagrees: "disagrees" } as const

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })

/** OurSpaces' hand strike: three ink lines drawn across a line you cross out. */
function Strike() {
  return (
    <svg className="knows-strike" aria-hidden="true">
      <line pathLength={1} x1="1%" y1="38%" x2="99%" y2="26%" />
      <line pathLength={1} x1="98%" y1="34%" x2="3%" y2="70%" />
      <line pathLength={1} x1="4%" y1="66%" x2="97%" y2="60%" />
    </svg>
  )
}

/** "unsupported: "<sentence>" (<why>)" from the Verifier, as the why and the sentence. */
function reasonOf(raw: string) {
  const m = /^unsupported: "(.*)" \((.*)\)$/s.exec(raw)
  if (!m) return { why: raw, sentence: null }
  const sentence = (m[1] ?? "").replace(/\s*\[\d+\]/g, "")
  return {
    why: m[2] ?? raw,
    sentence: sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence,
  }
}

/**
 * What Konkyo knows (plan F51): OurSpaces' "what this space knows", the cream other side of the
 * wall. Every line comes from rows: where your sources agree and disagree (the Analyst's World
 * Model, each source chip opens its passage), what you told it (H-MEM; cross a line out to make
 * it forget), the words your sources share, what's coming up, what it made, what it held back.
 */
export function KnowsView({ spaceId }: { spaceId: string | null }) {
  useRoomWall("knows")
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: qk.knows(spaceId),
    queryFn: () => api<Knows>(`/api/knows${spaceId ? `?space=${spaceId}` : ""}`),
  })
  const { forget } = useMemoryActions()
  const [draft, setDraft] = useState("")
  const [gone, setGone] = useState<Set<string>>(new Set())

  const tell = useMutation({
    mutationFn: (content: string) => api("/api/memories", { method: "POST", json: { content } }),
    onSuccess: () => {
      sound("place")
      void queryClient.invalidateQueries({ queryKey: ["knows"] })
      void queryClient.invalidateQueries({ queryKey: qk.memories })
    },
    onError: (error) => toast.error((error as Error).message),
  })
  const crossOut = (memory: MemoryItem) => {
    sound("place")
    setGone((g) => new Set(g).add(memory.id))
    // The strike draws first (OurSpaces' 220 ms), then it forgets.
    window.setTimeout(() => forget.mutate({ id: memory.id }), 500)
  }

  const name = data?.scope.name ?? (spaceId ? "this space" : "your library")
  const back = spaceId
    ? { href: `/spaces/${spaceId}` as Route, label: "back to the wall" }
    : { href: "/home" as Route, label: "back home" }
  const count = data ? data.claims.length + data.told.length + data.made.length : 0
  const told = data?.told ?? []

  return (
    <div
      className="room-knows knows-side-paper is-open"
      style={
        {
          "--knows-room": data?.scope.hex ?? "#7853ff",
          // The space's colour as the title's ink, deepened until it reads on the cream (3:1).
          "--knows-accent": deepen(data?.scope.hex ?? "#7853ff", "#f3ead9", 3.2),
        } as CSSProperties
      }
    >
      <div className="knows-scroll">
        <Link href={back.href} className="knows-back" onClick={() => sound("tap")}>
          <span aria-hidden="true">←</span> {back.label}
        </Link>
        <header className="knows-head">
          <div className="knows-title">
            <p className="knows-kicker">{name.toLowerCase()} · the other side of the wall</p>
            <h1>{spaceId ? "what this space knows" : "what konkyo knows"}</h1>
            <p className="knows-sub">
              {count > 0 && (
                <b key={count} className="knows-total">
                  {count}
                </b>
              )}
              {count > 0
                ? ` things it has noticed in ${name.toLowerCase()}.`
                : " What it notices shows up here as you ask and study."}{" "}
              Tap a source to see the passage. Cross out anything it has wrong.
            </p>
            <form
              className="knows-tell"
              onSubmit={(e) => {
                e.preventDefault()
                const text = draft.replace(/\s+/g, " ").trim()
                if (text.length < 3) return
                tell.mutate(text)
                setDraft("")
              }}
            >
              <input
                value={draft}
                maxLength={TOLD_CHARS}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="tell it something, like “cite page numbers”"
                aria-label="Tell Konkyo something"
              />
              <button type="submit" disabled={draft.trim().length < 3 || tell.isPending}>
                tell it
              </button>
            </form>
          </div>
        </header>

        {!data ? (
          <p className="knows-empty mt-10">opening…</p>
        ) : (
          <div className="knows-sheets">
            <div className="knows-sheet is-a">
              <section className="knows-sec is-soon">
                <h2>coming up</h2>
                <ul>
                  {data.coming.due > 0 ? (
                    <li className="knows-line" style={{ "--i": 0 } as CSSProperties}>
                      <Link
                        href={"/study/session?mode=review" as Route}
                        className="knows-fact"
                        onClick={() => sound("tap")}
                      >
                        <span className="knows-text">
                          <em>practice</em>
                          {data.coming.due} {data.coming.due === 1 ? "question" : "questions"} due
                          today
                        </span>
                        <span className="knows-why">
                          from {data.coming.files} {data.coming.files === 1 ? "source" : "sources"}
                          <i className="knows-go" aria-hidden="true">
                            {" "}
                            ↗
                          </i>
                        </span>
                      </Link>
                    </li>
                  ) : data.coming.next ? (
                    <li className="knows-line" style={{ "--i": 0 } as CSSProperties}>
                      <span className="knows-fact">
                        <span className="knows-text">
                          <em>practice</em>
                          {data.coming.next.count} due {day(data.coming.next.at).toLowerCase()}
                        </span>
                        <span className="knows-why">nothing due today</span>
                      </span>
                    </li>
                  ) : null}
                  {data.coming.agents.map((a, i) => (
                    <li key={a.id} className="knows-line" style={{ "--i": i + 1 } as CSSProperties}>
                      <Link href={"/agents" as Route} className="knows-fact">
                        <span className="knows-text">
                          <em>a watch</em>
                          {a.name}
                        </span>
                        <span className="knows-why">looks again {day(a.at).toLowerCase()}</span>
                      </Link>
                    </li>
                  ))}
                  {!data.coming.due && !data.coming.next && !data.coming.agents.length && (
                    <li className="knows-why px-1">
                      Nothing scheduled. Practice and watches show up here.
                    </li>
                  )}
                </ul>
              </section>
              {data.made.length > 0 && (
                <section className="knows-sec is-made">
                  <h2>what it has made</h2>
                  <ul>
                    {data.made.map((m, i) => (
                      <li
                        key={m.id}
                        className="knows-line is-made"
                        style={{ "--i": i } as CSSProperties}
                      >
                        <Link href={m.href as Route} className="knows-fact">
                          <span className="knows-text">
                            <span className="knows-words-of">{m.title}</span>
                          </span>
                          <span className="knows-why">
                            {m.kind === "practice"
                              ? "a practice set"
                              : m.kind === "brief"
                                ? "an audio brief"
                                : "a deep search"}{" "}
                            · {day(m.at)}
                          </span>
                        </Link>
                        <span className="knows-side">
                          <span className="knows-tag">{m.kind === "deep" ? "search" : m.kind}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="knows-sheet is-b">
              <section className="knows-sec is-habits">
                <h2>how you like answers</h2>
                {told.length > 0 ? (
                  <ul className="knows-notes">
                    {told.map((m, i) => (
                      <li
                        key={m.id}
                        className="knows-slot"
                        style={
                          {
                            "--i": i,
                            "--by": m.origin === "user_correction" ? "#c9ff3d" : "#ffe9c2",
                            "--on": "#111114",
                          } as CSSProperties
                        }
                      >
                        <div className={cn("knows-line is-told", gone.has(m.id) && "is-gone")}>
                          <span className="knows-fact">
                            <span className="knows-text">
                              <span className="knows-words-of">{m.content}</span>
                              <Strike />
                            </span>
                            <span className="knows-why">
                              {m.chatId ? (
                                <Link href={`/chats/${m.chatId}` as Route}>from a chat ↗</Link>
                              ) : (
                                "you said so"
                              )}
                            </span>
                          </span>
                          <span className="knows-side">
                            {gone.has(m.id) ? (
                              <button
                                type="button"
                                className="knows-act"
                                onClick={() => {
                                  // Forgetting deleted it; putting it back tells it again.
                                  tell.mutate(m.content)
                                  setGone((g) => {
                                    const next = new Set(g)
                                    next.delete(m.id)
                                    return next
                                  })
                                }}
                              >
                                put back
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="knows-act is-forget"
                                onClick={() => crossOut(m)}
                              >
                                cross out
                              </button>
                            )}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="knows-why mt-3 max-w-[46ch] pr-0!">
                    Nothing yet. Tell it above, or mark an answer “not right” and say why: it reads
                    these before every answer.
                  </p>
                )}
                {data.words.length > 0 && (
                  <ul>
                    <li
                      className="knows-line is-words is-wide"
                      style={{ "--i": 3 } as CSSProperties}
                    >
                      <span className="knows-fact">
                        <span className="knows-text">
                          <em>words your sources use a lot</em>
                        </span>
                        <span className="knows-words">
                          {data.words.map((w) => (
                            <i key={w.word} title={`in ${w.files} sources`}>
                              {w.word}
                            </i>
                          ))}
                        </span>
                        <span className="knows-why">each one in 2 or more sources</span>
                      </span>
                    </li>
                  </ul>
                )}
              </section>
            </div>

            <div className="knows-sheet is-c">
              <section className="knows-sec is-decided">
                <h2>where your sources stand</h2>
                {data.claims.length > 0 ? (
                  <ul>
                    {data.claims.map((claim, i) => (
                      <Claim key={claim.id} claim={claim} i={i} />
                    ))}
                  </ul>
                ) : (
                  <p className="knows-why mt-3 pr-0!">
                    Ask with <b>Compare</b> on in the chat box, about something two of your sources
                    both speak to, and where each one stands lands here.
                  </p>
                )}
              </section>
            </div>
          </div>
        )}

        {data && (
          <section className="knows-held" aria-labelledby="held-title">
            <h2 id="held-title" className="knows-sec">
              <span className="font-display text-[26px] font-extrabold tracking-[-0.02em]">
                what it held back
              </span>
            </h2>
            <p className="knows-held-line">
              {data.heldBack.answers} {data.heldBack.answers === 1 ? "answer" : "answers"} checked
              this week · {data.heldBack.quotes} quotes found word for word ·{" "}
              {data.heldBack.rewritten} rewritten · {data.heldBack.dropped} dropped
              <br />
              <span>
                When a quote isn't in its source, the sentence goes back to be rewritten or is
                dropped, and the receipt says so.
              </span>
            </p>
            {data.heldBack.examples.length > 0 && (
              <ul>
                {data.heldBack.examples.map((ex) => (
                  <li key={ex.chatId + ex.question}>
                    <b>{ex.question}</b>
                    {ex.reasons.map((r) => {
                      const { why, sentence } = reasonOf(r)
                      return (
                        <span key={r} className="mt-1 block">
                          {sentence && <>“{sentence}” </>}
                          <em className="not-italic text-[#5f5055]">{why}</em>
                        </span>
                      )
                    })}
                    <Link href={`/chats/${ex.chatId}` as Route} className="mt-1 inline-block">
                      see the answer ↗
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="knows-foot">
          It reads your sources, your corrections and the answers it checked, nothing else. Only you
          see this page. Crossing out a line makes Konkyo forget it.
        </p>
      </div>
    </div>
  )
}

/** One claim and where each source stands on it; a source chip opens the passage it was read from. */
function Claim({ claim, i }: { claim: KnowsClaim; i: number }) {
  const split = new Set(claim.cells.map((c) => c.stance)).size > 1
  return (
    <li className="knows-line" style={{ "--i": i } as CSSProperties}>
      <span className="knows-fact">
        <span className="knows-text">
          <em>{split ? "where they differ" : "where they agree"}</em>
          <span className="knows-words-of">{claim.text}</span>
        </span>
        <span className="knows-why is-places">
          <span className="knows-said">
            said in <b>{claim.cells.length}</b> sources
          </span>
        </span>
        <span className="knows-claim-cells">
          {claim.cells.map((cell) => (
            <button
              type="button"
              key={cell.fileId}
              className="knows-src"
              title={`“${cell.quote}”`}
              onClick={() => {
                sound("tap")
                openSource({
                  fileId: cell.fileId,
                  title: cell.title,
                  kind: cell.kind as FileKind,
                  passageId: cell.passageId || undefined,
                  page: cell.page ?? undefined,
                  quote: cell.quote,
                })
              }}
            >
              <em className={`is-${cell.stance}`}>{STANCE_WORD[cell.stance]}</em>
              <span className="truncate">{cell.title}</span>
            </button>
          ))}
        </span>
      </span>
    </li>
  )
}
