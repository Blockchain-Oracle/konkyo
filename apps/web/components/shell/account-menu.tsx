"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@konkyo/ui/components/avatar"
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
import { SidebarMenuButton } from "@konkyo/ui/components/sidebar"
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

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

export function AccountMenu({ user }: { user: ShellUser }) {
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              tooltip={displayName}
              className="data-popup-open:bg-sidebar-accent"
            />
          }
        >
          <Avatar className="size-7">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="bg-raised text-meta">{initials(displayName)}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-ui text-bone-white">{displayName}</span>
            {!user.isGuest && (
              <span className="truncate text-meta text-ash-gray">{user.email}</span>
            )}
          </span>
          <ChevronsUpDownIcon className="ml-auto text-ash-gray" strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-64">
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
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <SettingsIcon strokeWidth={1.5} />
            Settings
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
            Guests can't sign back in, so everything you made here will be gone. Continue with
            Google first to keep it.
          </DialogDescription>
          <DialogFooter className="mt-3 gap-2">
            <Button variant="ghost" onClick={signOut}>
              Sign out anyway
            </Button>
            <Button onClick={continueWithGoogle}>Continue with Google</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
