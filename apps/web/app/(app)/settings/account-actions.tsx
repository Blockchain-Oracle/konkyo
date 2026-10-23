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
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { deleteMyAccount } from "@/lib/use-account"

const CONFIRM = "delete"

/** Sign out and Delete account (plan F42). Deleting asks for the word, then can't be undone. */
export function AccountActions({ guest }: { guest: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    await authClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteMyAccount()
      router.replace("/sign-in")
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="divide-y divide-border border-y border-border">
      {!guest && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-ui text-bone-white">
            Sign out
            <span className="mt-0.5 block text-snippet text-ash-gray">
              Everything stays in your account for next time.
            </span>
          </p>
          <Button variant="secondary" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <p className="text-ui text-bone-white">
          {guest ? "Delete this guest session" : "Delete account"}
          <span className="mt-0.5 block text-snippet text-ash-gray">
            Your files, notes, chats, practice, agents and what Konkyo remembers, for good.
          </span>
        </p>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setTyped("")
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle className="text-subhead font-normal">
            {guest ? "Delete everything from this session?" : "Delete your Konkyo account?"}
          </DialogTitle>
          <DialogDescription className="text-ui text-ash-gray">
            Every file and its stored copy, every note, chat, practice set, agent and correction
            Konkyo remembers is deleted. This can't be undone. Documents you exported to Google Docs
            stay in your Drive.
          </DialogDescription>
          <label htmlFor="confirm-delete" className="mt-2 text-snippet text-ash-gray">
            Type <span className="text-bone-white">{CONFIRM}</span> to confirm
          </label>
          <Input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="h-10 rounded-lg"
          />
          <DialogFooter className="mt-3 gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={remove}
              disabled={busy || typed.trim().toLowerCase() !== CONFIRM}
            >
              {busy ? "Deleting…" : "Delete for good"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
