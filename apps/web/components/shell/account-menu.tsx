"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { cn } from "@konkyo/ui/lib/utils"
import { LogOutIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { deleteMyAccount } from "@/lib/use-account"

export type ShellUser = {
  name: string
  email: string
  image: string | null
  isGuest: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (
    parts.length > 1 ? `${parts[0]?.[0]}${parts.at(-1)?.[0]}` : (parts[0] ?? "?").slice(0, 2)
  ).toUpperCase()
}

/**
 * Your look at the bottom of the rail (or the phone bar), opening the account menu: keep a guest's
 * work with Google, Settings, Trash, sign out. (S17 turns this into the OurSpaces settings card.)
 */
export function AccountMenu({
  user,
  side = "right",
  className,
}: {
  user: ShellUser
  side?: "right" | "top"
  className?: string
}) {
  const router = useRouter()
  const [confirmGuestSignOut, setConfirmGuestSignOut] = useState(false)
  const displayName = user.isGuest ? "Guest" : user.name

  async function continueWithGoogle() {
    // Signing in while a guest links the accounts: the guest's work moves to Google's user.
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/home" })
    if (error) toast.error("Google sign-in didn't start. Try again.")
  }

  async function signOut() {
    await authClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  // Nobody can sign back in as a guest, so leaving deletes what the session made (as it says).
  async function leaveAsGuest() {
    try {
      await deleteMyAccount()
      router.replace("/sign-in")
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${displayName}: account`}
          title="you · settings"
          className={cn("rail-you", className)}
        >
          {/* OurSpaces' rail face: your photo (or your initials on violet) and the lime gear. */}
          <span className="member-face" style={{ width: 30, height: 30 }}>
            {user.image ? (
              // biome-ignore lint/performance/noImgElement: a small avatar from the auth provider
              <img
                className="member-face-img"
                src={user.image}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid size-full place-items-center rounded-full bg-violet font-display text-[11px] font-extrabold text-white">
                {initials(displayName)}
              </span>
            )}
          </span>
          <span className="rail-you-gear" aria-hidden>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
              <path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm6.1 3.6-.1-1.6 1.4-1.1-1.5-2.6-1.7.6-1.3-.9L10.6 1H7.6l-.3 1.8-1.4.8-1.6-.6-1.5 2.6L4.2 7.2 4 8.8l-1.3 1.1 1.5 2.6 1.7-.6 1.3.9.3 1.8h3l.3-1.8 1.4-.8 1.6.6 1.5-2.6Z" />
            </svg>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={side} align="end" sideOffset={10} className="w-64">
          {user.isGuest && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-snippet font-normal text-ash-gray">
                  You're a guest. Continue with Google to keep your work on any device.
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={continueWithGoogle}>
                  {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
                  <img src="/logos/google.svg" alt="" width={16} height={16} />
                  Continue with Google
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-snippet font-normal text-room-muted">
            {user.isGuest ? "you're a guest" : user.email}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <SettingsIcon strokeWidth={1.5} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/trash")}>
            <Trash2Icon strokeWidth={1.5} />
            Trash
          </DropdownMenuItem>
          <DropdownMenuItem onClick={user.isGuest ? () => setConfirmGuestSignOut(true) : signOut}>
            <LogOutIcon strokeWidth={1.5} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* A guest has no way back in, so signing out is confirmed and Google is offered first. */}
      <Dialog open={confirmGuestSignOut} onOpenChange={setConfirmGuestSignOut}>
        <DialogContent showCloseButton={false}>
          <DialogTitle className="text-subhead font-normal">
            Sign out of this guest session?
          </DialogTitle>
          <DialogDescription className="text-ui text-ash-gray">
            Guests can't sign back in, so everything you made here is deleted. Continue with Google
            first to keep it.
          </DialogDescription>
          <DialogFooter className="mt-3 gap-2">
            <Button variant="ghost" onClick={leaveAsGuest}>
              Sign out and delete
            </Button>
            <Button onClick={continueWithGoogle}>Continue with Google</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
