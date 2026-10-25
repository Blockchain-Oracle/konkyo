"use client"

import type { FileKind } from "@konkyo/config"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@konkyo/ui/components/hover-card"
import { mergeAttributes, Node } from "@tiptap/core"
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react"
import { ArrowUpRightIcon, CheckIcon, XIcon } from "lucide-react"
import { KindIcon } from "@/components/library/kind-icon"
import { whereIs } from "@/lib/format"
import { openSource } from "@/lib/preview"

/** What a citation in a note points at: a passage of a source, and the words it cites. */
export type CitationAttrs = {
  fileId: string
  passageId: string
  title: string
  kind: string
  page: number | null
  tStart: number | null
  byline: string | null
  quote: string
}

/** "Lo et al., 2014" in the editor; the export formats it in the chosen style. */
export function citationLabel(a: CitationAttrs) {
  const who =
    a.byline?.replace(" · ", ", ") ?? (a.title.length > 28 ? `${a.title.slice(0, 26)}…` : a.title)
  const where = whereIs(a)
  return where ? `${who}, ${where}` : who
}

function CitationView({ node, deleteNode, selected }: ReactNodeViewProps) {
  const a = node.attrs as CitationAttrs
  const open = () =>
    openSource({
      fileId: a.fileId,
      title: a.title,
      kind: a.kind as FileKind,
      passageId: a.passageId,
      quote: a.quote,
    })
  return (
    <NodeViewWrapper as="span" className="inline">
      <HoverCard>
        <HoverCardTrigger
          delay={250}
          render={
            <button
              type="button"
              onClick={open}
              contentEditable={false}
              data-selected={selected || undefined}
              className="write-cite"
            />
          }
        >
          {citationLabel(a)}
          <CheckIcon className="size-2.5 text-lime" strokeWidth={3} aria-hidden />
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-80 p-0">
          <div className="flex items-start gap-2.5 border-b border-border p-3">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-raised">
              <KindIcon kind={a.kind as FileKind} className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-snippet text-bone-white">{a.title}</p>
              <p className="mt-0.5 text-meta text-ash-gray">
                {[a.byline, whereIs(a)].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <blockquote className="mx-3 mt-3 border-l-2 border-partly/70 pl-3 text-snippet leading-relaxed text-silver-mist">
            “{a.quote}”
          </blockquote>
          <div className="flex items-center justify-between p-3">
            <button
              type="button"
              onClick={() => deleteNode()}
              className="inline-flex items-center gap-1 text-meta text-ash-gray hover:text-contradicts"
            >
              <XIcon className="size-3" strokeWidth={1.75} />
              Remove
            </button>
            <button
              type="button"
              onClick={open}
              className="inline-flex items-center gap-1 text-meta text-ash-gray hover:text-bone-white"
            >
              Open in source
              <ArrowUpRightIcon className="size-3" strokeWidth={1.75} />
            </button>
          </div>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  )
}

/**
 * An inline citation (plan F21–F22): an atom holding the passage and its exact quote, drawn as
 * a chip. It adds no words to the note's plain text, so chat and Check my draft read only the
 * person's own writing; the export formats it in the chosen citation style.
 */
export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    const attr = (name: keyof CitationAttrs, fallback: unknown = null) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => {
        const v = el.getAttribute(`data-${name}`)
        return name === "page" || name === "tStart" ? (v ? Number(v) : null) : v
      },
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs[name] == null ? {} : { [`data-${name}`]: String(attrs[name]) },
    })
    return {
      fileId: attr("fileId"),
      passageId: attr("passageId"),
      title: attr("title", ""),
      kind: attr("kind", "pdf"),
      page: attr("page"),
      tStart: attr("tStart"),
      byline: attr("byline"),
      quote: attr("quote", ""),
    }
  },
  parseHTML() {
    return [{ tag: "cite[data-passageId]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["cite", mergeAttributes(HTMLAttributes), citationLabel(node.attrs as CitationAttrs)]
  },
  renderText() {
    return ""
  },
  addNodeView() {
    return ReactNodeViewRenderer(CitationView, { as: "span" })
  },
})
