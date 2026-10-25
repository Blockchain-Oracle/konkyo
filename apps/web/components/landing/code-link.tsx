"use client"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@konkyo/ui/components/dialog"
import { type ReactNode, useEffect, useState } from "react"
import type { CodeRef } from "@/lib/made-with"

type Excerpt = {
  file: string
  symbol: string
  from: number
  to: number
  more: number
  html: string
}

// One request per partner page, made the first time any of its code is opened.
const loaded = new Map<string, Promise<Record<string, Excerpt>>>()
function excerptsOf(partner: string) {
  let pending = loaded.get(partner)
  if (!pending) {
    pending = fetch(`/made-with/${partner}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    })
    pending.catch(() => loaded.delete(partner))
    loaded.set(partner, pending)
  }
  return pending
}

/**
 * "follow it in the code ↗" (plan F61): the repo is private, so instead of a GitHub link the
 * function itself opens on paper, highlighted, numbered as in its file. The excerpts are copied
 * from the source by `pnpm made-with:code`.
 */
export function CodeLink({
  partner,
  code,
  className,
  children,
}: {
  partner: string
  code: CodeRef
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [excerpt, setExcerpt] = useState<Excerpt | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open || excerpt) return
    let live = true
    setFailed(false)
    excerptsOf(partner)
      .then((all) => {
        const found = all[`${code.file}#${code.symbol}`]
        if (!live) return
        if (found) setExcerpt(found)
        else setFailed(true)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [open, excerpt, partner, code])

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="made-with-code surface-paper">
          <div className="made-with-code-head">
            <DialogTitle className="made-with-code-symbol">{code.symbol}</DialogTitle>
            <DialogDescription className="made-with-code-file">
              {code.file}
              {excerpt && (
                <>
                  {" "}
                  · lines {excerpt.from}–{excerpt.to + excerpt.more}
                </>
              )}
            </DialogDescription>
          </div>
          {excerpt ? (
            <div className="made-with-code-body">
              <div
                className="made-with-code-lines"
                style={{ counterReset: `line ${excerpt.from - 1}` }}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki's HTML of our own source, made at build time by scripts/made-with-code.ts
                dangerouslySetInnerHTML={{ __html: excerpt.html }}
              />
              {excerpt.more > 0 && (
                <p className="made-with-code-more">
                  … {excerpt.more} more line{excerpt.more === 1 ? "" : "s"} in the file
                </p>
              )}
            </div>
          ) : (
            <p className="made-with-code-wait" aria-live="polite">
              {failed ? "The code didn't load. Close this and try again." : "Opening the code…"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
