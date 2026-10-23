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
import { Input } from "@konkyo/ui/components/input"
import { Textarea } from "@konkyo/ui/components/textarea"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CopyIcon, ExternalLinkIcon, GlobeIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"

type Share = { slug: string; path: string; description: string | null; allowDownloads: boolean }

/**
 * Share a folder (plan F36): a read-only link where anyone can read its sources and ask about
 * them. Downloads are off unless turned on; stopping sharing turns the link off at once.
 */
export function ShareDialog({
  folder,
  onClose,
}: {
  folder: { id: string; name: string } | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(folder)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {folder && <ShareForm key={folder.id} folder={folder} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ShareForm({
  folder,
  onClose,
}: {
  folder: { id: string; name: string }
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const key = ["share", folder.id]
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api<{ share: Share | null }>(`/api/folders/${folder.id}/share`),
  })
  const share = data?.share ?? null
  const [description, setDescription] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<boolean | null>(null)
  const text = description ?? share?.description ?? ""
  const allow = downloads ?? share?.allowDownloads ?? false

  const save = useMutation({
    mutationFn: (body: { description?: string | null; allowDownloads?: boolean }) =>
      api<{ share: Share }>(`/api/folders/${folder.id}/share`, { method: "PUT", json: body }),
    onSuccess: (result) => queryClient.setQueryData(key, result),
    onError: (error: Error) => toast.error(error.message),
  })
  const stop = useMutation({
    mutationFn: () => api(`/api/folders/${folder.id}/share`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.setQueryData(key, { share: null })
      toast("The link is off. Nobody can open it now.")
      onClose()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const url = share ? `${window.location.origin}${share.path}` : ""
  const copy = async () => {
    await navigator.clipboard.writeText(url)
    toast("Link copied")
  }

  // Until the link is known, neither form shows: a public folder never flashes "Create public link".
  if (isPending)
    return (
      <>
        <DialogTitle className="text-subhead font-normal">Share “{folder.name}”</DialogTitle>
        <div className="h-48 animate-pulse rounded-xl bg-raised" aria-busy />
      </>
    )

  return (
    <>
      <DialogTitle className="text-subhead font-normal">Share “{folder.name}”</DialogTitle>
      <DialogDescription>
        Anyone with the link can read the sources in this folder and ask about them. Answers come
        only from these sources, with the same checks as yours. Your notes, chats and memory stay
        private.
      </DialogDescription>

      {share && (
        <div className="mt-1 flex items-center gap-2">
          <Input readOnly value={url} aria-label="Public link" className="h-10 rounded-lg" />
          <Button variant="secondary" size="icon" onClick={copy} aria-label="Copy the link">
            <CopyIcon strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open the public page"
            render={<a href={share.path} target="_blank" rel="noreferrer" />}
            nativeButton={false}
          >
            <ExternalLinkIcon strokeWidth={1.5} />
          </Button>
        </div>
      )}

      <label htmlFor="share-description" className="mt-2 text-snippet text-ash-gray">
        Description (optional)
      </label>
      <Textarea
        id="share-description"
        value={text}
        maxLength={500}
        rows={2}
        onChange={(e) => setDescription(e.target.value)}
        // An already public folder saves when the field is left.
        onBlur={() => {
          if (share && text !== (share.description ?? "")) save.mutate({ description: text })
        }}
        placeholder="What's in this folder, for someone opening the link"
        className="resize-none rounded-lg"
      />
      <div className="flex items-start gap-3">
        <Checkbox
          id="share-downloads"
          checked={allow}
          disabled={isPending}
          onCheckedChange={(on) => {
            setDownloads(Boolean(on))
            if (share) save.mutate({ allowDownloads: Boolean(on) })
          }}
          className="mt-0.5"
        />
        <label htmlFor="share-downloads" className="text-ui text-bone-white">
          Let visitors download the files
          <span className="mt-0.5 block text-snippet text-ash-gray">
            Off: they read each file in the viewer, without a download button.
          </span>
        </label>
      </div>

      <DialogFooter className="mt-2 gap-2">
        {share ? (
          <>
            <Button
              variant="destructive"
              onClick={() => stop.mutate()}
              disabled={stop.isPending}
              className="sm:mr-auto"
            >
              Stop sharing
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate({ description: text || null, allowDownloads: allow })}
              disabled={isPending || save.isPending}
            >
              <GlobeIcon strokeWidth={1.5} />
              Create public link
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
