"use client"

import { Button } from "@konkyo/ui/components/button"
import { Checkbox } from "@konkyo/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { FileTextIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/fetcher"
import { useSettings } from "@/lib/use-settings"
import { CitationStyleList } from "./citation-style-list"

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"

/**
 * Sends a note to Google Docs. The first time, Google asks the person to let Konkyo create
 * files in their Drive (drive.file: only the files Konkyo makes), then brings them back to the
 * note, where the export finishes.
 */
export async function exportToGoogle(noteId: string, style: string) {
  const res = await api<{ url?: string; needsScope?: boolean }>(
    `/api/notes/${noteId}/export/google`,
    { method: "POST", json: { style } },
  )
  if (res.needsScope) {
    await authClient.linkSocial({
      provider: "google",
      scopes: [DRIVE_FILE_SCOPE],
      callbackURL: `/write/${noteId}?export=google&style=${encodeURIComponent(style)}`,
    })
    return null
  }
  return res.url ?? null
}

export function openDocToast(url: string) {
  toast.success("In Google Docs", {
    description: "With your citations and reference list.",
    action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") },
    duration: 15_000,
  })
}

/**
 * Export a note: Word,
 * its citations and reference list in the chosen CSL style. The style can be the default for
 * every export.
 */
export function ExportDialog({
  noteId,
  title,
  onClose,
}: {
  noteId: string
  title: string
  onClose: () => void
}) {
  const { settings } = useSettings()
  const [style, setStyle] = useState<string | null>(null)
  const [makeDefault, setMakeDefault] = useState(false)
  const [busy, setBusy] = useState<"word" | "google" | null>(null)
  const { data: session } = authClient.useSession()
  const guest = Boolean(session?.user.isAnonymous)
  const chosen = style ?? settings?.citationStyle ?? "apa"

  const google = async () => {
    setBusy("google")
    try {
      if (makeDefault)
        await api("/api/settings", { method: "PATCH", json: { citationStyle: chosen } })
      const url = await exportToGoogle(noteId, chosen)
      if (url) {
        openDocToast(url)
        onClose()
      }
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(null)
    }
  }

  const download = async () => {
    setBusy("word")
    try {
      if (makeDefault)
        await api("/api/settings", { method: "PATCH", json: { citationStyle: chosen } })
      const res = await fetch(`/api/notes/${noteId}/export?style=${encodeURIComponent(chosen)}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "That export didn't work.")
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = `${title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Konkyo note"}.docx`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-subhead font-normal">Export</DialogTitle>
        <DialogDescription>
          Word or Google Docs, with your citations and reference list in the style you choose.
        </DialogDescription>
        <CitationStyleList
          chosen={chosen}
          defaultId={settings?.citationStyle}
          onChoose={(s) => setStyle(s.id)}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="make-default"
            checked={makeDefault}
            onCheckedChange={(on) => setMakeDefault(Boolean(on))}
          />
          <label htmlFor="make-default" className="text-snippet text-ash-gray">
            Make this my default style
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={google}
            disabled={busy != null || guest}
            title={
              guest ? "Continue with Google (account menu) to export to Google Docs" : undefined
            }
          >
            {busy === "google" ? "Sending…" : "Google Docs"}
          </Button>
          <Button onClick={download} disabled={busy != null}>
            <FileTextIcon strokeWidth={1.5} />
            {busy === "word" ? "Exporting…" : "Export to Word"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
