"use client"

import { Button } from "@konkyo/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { BookMarkedIcon, DownloadIcon, FolderInputIcon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { openMoveFiles } from "@/components/shell/app-dialogs"
import { api } from "@/lib/fetcher"
import { useFileActions } from "@/lib/use-library"

function saveText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * What to do with the selected files (plan F05): move, export their bibliography, download them
 * as one .zip, or move them to Trash. It floats above the list while anything is selected.
 */
export function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const { remove } = useFileActions()
  const n = ids.length

  const exportBibliography = async () => {
    try {
      const { bibtex, included, missing } = await api<{
        bibtex: string
        included: number
        missing: number
      }>("/api/files/bibliography", { method: "POST", json: { fileIds: ids } })
      if (!included) {
        toast.error("None of these have citation details yet. Add them in Details first.")
        return
      }
      saveText("konkyo-bibliography.bib", `${bibtex}\n`, "application/x-bibtex")
      toast.success(
        missing
          ? `Exported ${included} of ${n}. ${missing} ${missing === 1 ? "has" : "have"} no citation details yet.`
          : `Exported ${included} ${included === 1 ? "entry" : "entries"}`,
      )
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={`${n} selected`}
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6"
    >
      <div className="flex animate-in items-center gap-1 rounded-full border border-line-strong bg-raised p-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.5)] duration-(--duration-menu) fade-in-0 slide-in-from-bottom-2">
        <span className="px-3 text-snippet text-bone-white tabular-nums" aria-live="polite">
          {n} selected
        </span>
        <BarButton label="Move to…" onClick={() => openMoveFiles(ids)}>
          <FolderInputIcon />
        </BarButton>
        <BarButton label="Export bibliography (.bib)" onClick={exportBibliography}>
          <BookMarkedIcon />
        </BarButton>
        <BarButton
          label="Download as .zip"
          onClick={() => {
            window.location.href = `/api/files/archive?ids=${ids.join(",")}`
          }}
        >
          <DownloadIcon />
        </BarButton>
        <BarButton
          label="Move to Trash"
          onClick={() => remove.mutate(ids, { onSuccess: onClear })}
          destructive
        >
          <Trash2Icon />
        </BarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <BarButton label="Clear selection (Esc)" onClick={onClear}>
          <XIcon />
        </BarButton>
      </div>
    </div>
  )
}

function BarButton({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={
              destructive
                ? "text-contradicts hover:bg-contradicts/10 hover:text-contradicts [&_svg]:stroke-[1.5]"
                : "text-silver-mist hover:text-bone-white [&_svg]:stroke-[1.5]"
            }
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
