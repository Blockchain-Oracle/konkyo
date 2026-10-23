"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { Input } from "@konkyo/ui/components/input"
import { useState } from "react"
import { toast } from "sonner"
import { useFileActions } from "@/lib/use-library"

/** Import a web page, a paper's PDF link or a YouTube video by URL (plan F02). */
export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { importUrl } = useFileActions()
  const [url, setUrl] = useState("")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-subhead font-normal">Import by URL</DialogTitle>
        <DialogDescription className="text-ui text-ash-gray">
          A web page, a link to a PDF, or a YouTube video. It's saved as a document you can cite.
        </DialogDescription>
        <form
          className="mt-1.5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            importUrl.mutate(url, {
              onSuccess: () => {
                toast.success("Importing. It'll be ready in a moment.")
                setUrl("")
                onOpenChange(false)
              },
            })
          }}
        >
          <Input
            autoFocus
            type="url"
            inputMode="url"
            required
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Address to import"
            className="h-10 rounded-lg"
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim() || importUrl.isPending}>
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
