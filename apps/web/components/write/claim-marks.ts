import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export type ClaimMark = {
  id: string
  sentence: string
  verdict: "checking" | "supported" | "partly" | "contradicted" | "not-found"
}

type ClaimState = { claims: ClaimMark[]; set: DecorationSet; active: string | null }

const key = new PluginKey<ClaimState>("claimMarks")

/**
 * The note as plain text with each character's document position, in the same shape as the
 * text sent to the check (blocks joined by a blank line, citations adding nothing).
 */
export function flatten(doc: PMNode) {
  let text = ""
  const at: number[] = []
  let first = true
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (!first) {
        text += "\n\n"
        at.push(-1, -1)
      }
      first = false
    }
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) at.push(pos + i)
      text += node.text
    }
    return true
  })
  return { text, at }
}

function decorate(doc: PMNode, claims: ClaimMark[], active: string | null) {
  if (!claims.length) return DecorationSet.empty
  const { text, at } = flatten(doc)
  const decorations: Decoration[] = []
  for (const claim of claims) {
    const start = text.indexOf(claim.sentence)
    if (start === -1) continue
    // A sentence can run across marks and citations: decorate each run of real positions.
    let runStart = -1
    let prev = -1
    const flush = () => {
      if (runStart !== -1)
        decorations.push(
          Decoration.inline(runStart, prev + 1, {
            class: `claim claim-${claim.verdict}${claim.id === active ? " claim-active" : ""}`,
            "data-claim": claim.id,
          }),
        )
      runStart = -1
    }
    for (let i = start; i < start + claim.sentence.length; i++) {
      const pos = at[i] ?? -1
      if (pos === -1 || (prev !== -1 && pos !== prev + 1)) flush()
      if (pos !== -1) {
        if (runStart === -1) runStart = pos
        prev = pos
      }
    }
    flush()
  }
  return DecorationSet.create(doc, decorations)
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    claimMarks: {
      /** Shows Check my draft's verdicts under their sentences (they're never saved). */
      setClaims: (claims: ClaimMark[]) => ReturnType
      setActiveClaim: (id: string | null) => ReturnType
    }
  }
}

/**
 * Check my draft's underlines (plan F23, §7.5: claim underlines with a side list): decorations,
 * not marks, so they sit over the text without changing the note, and follow edits until the
 * next check. Clicking one opens its card in the side panel.
 */
export const ClaimMarks = Extension.create<{ onClick?: (id: string) => void }>({
  name: "claimMarks",
  addOptions() {
    return { onClick: undefined }
  },
  addCommands() {
    return {
      setClaims:
        (claims) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(key, { claims }))
          return true
        },
      setActiveClaim:
        (id) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(key, { active: id }))
          return true
        },
    }
  },
  addProseMirrorPlugins() {
    const onClick = this.options.onClick
    return [
      new Plugin<ClaimState>({
        key,
        state: {
          init: (): ClaimState => ({ claims: [], set: DecorationSet.empty, active: null }),
          apply(tr, value, _old, state): ClaimState {
            const meta = tr.getMeta(key) as
              | { claims?: ClaimMark[]; active?: string | null }
              | undefined
            if (meta) {
              const claims = meta.claims ?? value.claims
              const active = meta.active !== undefined ? meta.active : value.active
              return { claims, active, set: decorate(state.doc, claims, active) }
            }
            if (!tr.docChanged) return value
            return { ...value, set: decorate(state.doc, value.claims, value.active) }
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.set
          },
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement).closest("[data-claim]")
            const id = el?.getAttribute("data-claim")
            if (id && onClick) {
              onClick(id)
              return false
            }
            return false
          },
        },
      }),
    ]
  },
})

/**
 * Where a citation for a sentence goes: right after its last word, before its closing
 * punctuation ("… memory [Lo et al., 2014]."). Null when the sentence isn't in the note.
 */
export function sentenceEnd(doc: PMNode, sentence: string): number | null {
  const { text, at } = flatten(doc)
  const start = text.indexOf(sentence)
  if (start === -1) return null
  let end = start + sentence.length
  while (end > start && /[.!?;:"”’)\s]/.test(text[end - 1] ?? "")) end--
  const pos = at[end - 1]
  return pos == null || pos === -1 ? null : pos + 1
}
