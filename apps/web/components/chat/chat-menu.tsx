"use client"

import { Button } from "@konkyo/ui/components/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@konkyo/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Input } from "@konkyo/ui/components/input"
import {
  DownloadIcon,
  EllipsisIcon,
  FileTextIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useChatActions } from "@/lib/use-chats"

/** Rename, pin and delete one chat, from its row or its own header. */
export function ChatMenu({
  chat,
  leaveOnDelete = false,
  sticker = false,
}: {
  chat: { id: string; title: string; pinnedAt: string | null }
  /** In the chat itself: deleting it goes back to the Chats list. */
  leaveOnDelete?: boolean
  /** On a wall: a black sticker, readable on any colour. */
  sticker?: boolean
}) {
  const { rename, pin, trash } = useChatActions()
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(chat.title)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            sticker ? (
              <Button variant="sticker" size="icon" aria-label={`More for ${chat.title}`} />
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More for ${chat.title}`}
                className="relative z-10 shrink-0 text-ash-gray hover:text-bone-white"
              />
            )
          }
        >
          {sticker ? (
            <span aria-hidden className="text-[15px] leading-none tracking-[0.08em]">
              •••
            </span>
          ) : (
            <EllipsisIcon strokeWidth={1.5} />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              setTitle(chat.title)
              setRenaming(true)
            }}
          >
            <PencilIcon strokeWidth={1.5} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => pin.mutate({ id: chat.id, pinned: !chat.pinnedAt })}>
            {chat.pinnedAt ? <PinOffIcon strokeWidth={1.5} /> : <PinIcon strokeWidth={1.5} />}
            {chat.pinnedAt ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<a href={`/api/chats/${chat.id}/export?format=pdf`} download />}
          >
            <DownloadIcon strokeWidth={1.5} />
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<a href={`/api/chats/${chat.id}/export?format=docx`} download />}
          >
            <DownloadIcon strokeWidth={1.5} />
            Export as Word
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href={`/api/chats/${chat.id}/export?format=md`} download />}>
            <FileTextIcon strokeWidth={1.5} />
            Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              trash.mutate(
                { id: chat.id, title: chat.title },
                { onSuccess: () => leaveOnDelete && router.push("/chats") },
              )
            }
          >
            <Trash2Icon strokeWidth={1.5} />
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="text-subhead font-normal">Rename chat</DialogTitle>
          <form
            className="mt-1 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!title.trim()) return
              rename.mutate({ id: chat.id, title: title.trim() })
              setRenaming(false)
            }}
          >
            <Input
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Chat name"
              className="h-10 rounded-lg"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
