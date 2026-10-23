"use client"

import type { CheckEvent, ClaimResult, Verdict } from "@konkyo/agents"
import { NOTES } from "@konkyo/config"
import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "./fetcher"

type Payload = { title?: string; content?: unknown; text?: string }

export type SaveState = "saved" | "saving" | "retrying"

const backupKey = (id: string) => `konkyo-note-${id}`

/** The last unsaved copy kept in this browser, if it's newer than what the server has. */
export function readBackup(id: string, serverUpdatedAt: string): Payload | null {
  try {
    const raw = localStorage.getItem(backupKey(id))
    if (!raw) return null
    const saved = JSON.parse(raw) as Payload & { at: string }
    return saved.at > serverUpdatedAt ? saved : null
  } catch {
    return null
  }
}

/**
 * Autosave (plan F24, §7.6): changes are sent a moment after typing stops. If the save fails
 * the copy stays in this browser and the save retries; the badge says "Not saved, retrying".
 */
export function useAutosave(id: string) {
  const [state, setState] = useState<SaveState>("saved")
  const pending = useRef<Payload | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flying = useRef(false)

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (flying.current || !pending.current) return
    const payload = pending.current
    pending.current = null
    flying.current = true
    setState("saving")
    try {
      await api(`/api/notes/${id}`, { method: "PATCH", json: payload })
      flying.current = false
      if (pending.current) void flush()
      else {
        setState("saved")
        try {
          localStorage.removeItem(backupKey(id))
        } catch {}
      }
    } catch {
      flying.current = false
      pending.current = { ...payload, ...(pending.current ?? {}) }
      setState("retrying")
      timer.current = setTimeout(() => void flush(), 4000)
    }
  }, [id])

  const schedule = useCallback(
    (payload: Payload) => {
      pending.current = { ...(pending.current ?? {}), ...payload }
      try {
        localStorage.setItem(
          backupKey(id),
          JSON.stringify({ ...pending.current, at: new Date().toISOString() }),
        )
      } catch {}
      setState((s) => (s === "retrying" ? s : "saving"))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), NOTES.autosaveMs)
    },
    [id, flush],
  )

  // Leaving the page sends what's pending at once.
  useEffect(() => {
    const leave = () => void flush()
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("pagehide", leave)
      void flush()
    }
  }, [flush])

  return { state, schedule, flush }
}

export type CheckRun = {
  running: boolean
  results: Map<
    string,
    ClaimResult | { id: string; sentence: string; claim: string; verdict: "checking" }
  >
  counts?: Record<Verdict, number>
  sql?: string
  ms?: number
  error?: string
}

/** Check my draft (F23) as a stream: claims arrive "checking", then each verdict. */
export function useDraftCheck(id: string, onChange: (run: CheckRun) => void) {
  const [run, setRun] = useState<CheckRun>({ running: false, results: new Map() })
  const start = useCallback(
    async (text: string) => {
      let current: CheckRun = { running: true, results: new Map() }
      const push = (next: CheckRun) => {
        current = next
        setRun(next)
        onChange(next)
      }
      push(current)
      try {
        const res = await fetch(`/api/notes/${id}/check`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        })
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? "The check didn't start.")
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            const event = JSON.parse(line) as CheckEvent | { type: "error"; message: string }
            const results = new Map(current.results)
            if (event.type === "claims")
              for (const c of event.claims) results.set(c.id, { ...c, verdict: "checking" })
            else if (event.type === "result") results.set(event.result.id, event.result)
            else if (event.type === "done") {
              push({
                ...current,
                running: false,
                counts: event.counts,
                sql: event.sql,
                ms: event.ms,
              })
              continue
            } else if (event.type === "error") {
              push({ ...current, running: false, error: event.message })
              continue
            }
            push({ ...current, results })
          }
        }
        if (current.running) push({ ...current, running: false })
      } catch (error) {
        push({ ...current, running: false, error: (error as Error).message })
      }
    },
    [id, onChange],
  )
  return { run, start }
}
