"use client"

import type { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react"
import { useSelectionCapability } from "@embedpdf/plugin-selection/react"
import { cn } from "@konkyo/ui/lib/utils"
import { CopyIcon, HighlighterIcon, MessageSquareQuoteIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { quoteInComposer } from "@/lib/composer-draft"
import { useHighlightActions } from "@/lib/use-highlights"

/**
 * The pill over a text selection in a source (plan F08, Matter's pattern): short text labels,
 * placed above the selection unless there is no room. Ask hands the quote to the composer.
 */
export function SelectionToolbar({
  menuWrapperProps,
  placement,
  context,
  documentId,
  fileId,
  title,
}: SelectionSelectionMenuProps & { documentId: string; fileId: string; title: string }) {
  const { provides: selection } = useSelectionCapability()
  const router = useRouter()
  const scope = selection?.forDocument(documentId)
  const { add } = useHighlightActions(fileId)
  // Above the selection whenever there is room for the pill (it then never covers the next lines).
  const above = placement.suggestTop || (placement.spaceAbove ?? 0) > 56

  const selectedText = async () =>
    ((await scope?.getSelectedText().toPromise()) ?? []).join(" ").replace(/\s+/g, " ").trim()

  const ask = async () => {
    const text = await selectedText()
    if (!text) return
    quoteInComposer({ fileId, title, page: context.pageIndex + 1, text })
    scope?.clear()
    router.push("/home")
  }
  const copy = () => {
    scope?.copyToClipboard()
    toast.success("Copied")
  }
  // One highlight per page the selection covers, boxed like passages (page points, unrotated).
  const highlight = async () => {
    const pages = scope?.getFormattedSelection() ?? []
    const texts = ((await scope?.getSelectedText().toPromise()) ?? []).map((t) =>
      t.replace(/\s+/g, " ").trim(),
    )
    const marks = pages
      .map((sel, i) => ({
        page: sel.pageIndex + 1,
        rects: sel.segmentRects.map(
          (r) =>
            [r.origin.x, r.origin.y, r.origin.x + r.size.width, r.origin.y + r.size.height] as [
              number,
              number,
              number,
              number,
            ],
        ),
        text: (pages.length === texts.length ? texts[i] : texts.join(" ")) ?? "",
      }))
      .filter((m) => m.rects.length && m.text)
    if (marks.length) add.mutate(marks)
    scope?.clear()
  }

  return (
    <div {...menuWrapperProps}>
      <div
        role="toolbar"
        aria-label="Selected text"
        className={cn(
          "absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-line-strong bg-raised p-1 shadow-[0_8px_24px_rgb(0_0_0/0.45)]",
          "animate-in fade-in-0 zoom-in-95 duration-(--duration-tooltip)",
          above ? "bottom-[calc(100%+8px)] origin-bottom" : "top-[calc(100%+8px)] origin-top",
        )}
        // The page underneath starts a new selection on pointer down; the toolbar must not.
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ToolbarAction onClick={ask}>
          <MessageSquareQuoteIcon />
          Ask
        </ToolbarAction>
        <ToolbarAction onClick={highlight}>
          <HighlighterIcon />
          Highlight
        </ToolbarAction>
        <ToolbarAction onClick={copy}>
          <CopyIcon />
          Copy
        </ToolbarAction>
      </div>
    </div>
  )
}

function ToolbarAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-snippet whitespace-nowrap text-bone-white transition-[background-color,scale] duration-(--duration-press) hover:bg-white/8 active:scale-[0.97] [&_svg]:size-3.5 [&_svg]:stroke-[1.75]"
    >
      {children}
    </button>
  )
}
