"use client"

/*
 * The account menu behind the rail's "you" tile: who you are at a glance, the places that belong
 * to you (each said in a line, so none is a mystery), and the way out. Editing yourself is
 * Settings' job, one tap away.
 */

import { APP, ROUTES } from "@konkyo/config"
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { cn } from "@konkyo/ui/lib/utils"
import {
  ArrowUpRightIcon,
  BrainIcon,
  ChevronRightIcon,
  HeadphonesIcon,
  LogOutIcon,
  type LucideIcon,
  SettingsIcon,
  Trash2Icon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type CSSProperties, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import type { Face } from "@/lib/profiles"
import { sound } from "@/lib/sounds"
import { deleteMyAccount } from "@/lib/use-account"
import { useMe } from "@/lib/use-me"
import { openKeep } from "./keep-dialog"
import { MemberFace } from "./member-face"

export type ShellUser = {
  name: string
  isGuest: boolean
  face: Face
}

/** Keep a guest's work: signing in while a guest links the two (owned.ts moves everything). */
const keepAccount = () =>
  openKeep("your name, your look, your library: kept, so you're the same person on your phone.")

/** One place in the menu: its picture, its name, and what it is in a line. */
function Place({
  icon: Icon,
  title,
  about,
  href,
  external,
}: {
  icon: LucideIcon
  title: string
  about: string
  href: string
  external?: boolean
}) {
  return (
    <DropdownMenuItem
      render={
        <Link
          href={href as Route}
          {...(external ? { target: "_blank", rel: "noreferrer" } : undefined)}
        />
      }
      className="gap-3 rounded-xl px-2 py-2"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-white/8 text-bone-white">
        <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-ui leading-tight font-semibold text-bone-white">
          {title}
          {external && <ArrowUpRightIcon className="size-3 text-ash-gray" aria-hidden />}
        </span>
        <span className="mt-0.5 block text-meta leading-snug text-ash-gray">{about}</span>
      </span>
    </DropdownMenuItem>
  )
}

/** Under this width the rail becomes a bar along the bottom (house.css), so the menu opens upward. */
const PHONE_BAR = "(max-width: 800px)"

function usePhoneBar() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(PHONE_BAR)
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => window.matchMedia(PHONE_BAR).matches,
    () => false,
  )
}

/** Your face at the foot of the rail (or the phone bar): it opens the account menu. */
export function YouTile({ user }: { user: ShellUser }) {
  const router = useRouter()
  const phone = usePhoneBar()
  const { me } = useMe()
  const [open, setOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const face = me?.face ?? user.face
  const name = me?.name ?? user.name
  const isGuest = me?.isGuest ?? user.isGuest

  const signOut = async () => {
    await authClient.signOut()
    router.replace(ROUTES.signIn as Route)
    router.refresh()
  }

  // Nobody can sign back in as a guest, so leaving deletes what the session made (as it says).
  const leaveAsGuest = async () => {
    try {
      await deleteMyAccount()
      router.replace(ROUTES.signIn as Route)
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          onClick={() => sound("tap")}
          render={
            <button
              type="button"
              className={cn("rail-you", open && "is-open")}
              style={{ "--look": face.color } as CSSProperties}
              aria-label={`${face.name}: your account`}
              title="you · account"
            >
              <MemberFace face={face} size="sm" />
              <span className="rail-you-gear" aria-hidden>
                <svg
                  viewBox="0 0 16 16"
                  width="10"
                  height="10"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm6.1 3.6-.1-1.6 1.4-1.1-1.5-2.6-1.7.6-1.3-.9L10.6 1H7.6l-.3 1.8-1.4.8-1.6-.6-1.5 2.6L4.2 7.2 4 8.8l-1.3 1.1 1.5 2.6 1.7-.6 1.3.9.3 1.8h3l.3-1.8 1.4-.8 1.6.6 1.5-2.6Z" />
                </svg>
              </span>
            </button>
          }
        />
        <DropdownMenuContent
          side={phone ? "top" : "right"}
          align="end"
          sideOffset={phone ? 12 : 18}
          className="w-80 rounded-card bg-sticker p-2 max-[800px]:w-[calc(100vw-1.5rem)]"
        >
          {/* who you are: the face, the name, and where it is kept; it opens your profile */}
          <DropdownMenuItem
            render={<Link href={`${ROUTES.settings}#you` as Route} />}
            className="gap-3 rounded-xl px-2 py-2.5"
          >
            <MemberFace face={face} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[18px] leading-tight font-extrabold tracking-[-0.02em] text-bone-white">
                {name}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-meta text-ash-gray">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    isGuest ? "bg-saffron-spark" : "bg-verified",
                  )}
                />
                <span className="truncate">
                  {isGuest ? "Guest · only in this browser" : (me?.email ?? "Kept on every device")}
                </span>
              </span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-ash-gray" aria-hidden />
          </DropdownMenuItem>

          {isGuest && (
            <DropdownMenuItem
              onClick={keepAccount}
              className="mt-1 justify-center rounded-full bg-lime py-2 text-ui font-bold text-ink focus:bg-lime focus:text-ink focus:brightness-95"
            >
              Keep this on every device
              <ChevronRightIcon className="size-4" aria-hidden />
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="my-1.5" />
          <Place
            icon={SettingsIcon}
            title="Settings"
            about="Profile, sounds, connectors, notifications"
            href={ROUTES.settings}
          />
          {me?.handle && (
            <Place
              icon={UserRoundIcon}
              title="Your page"
              about={`${APP.url.replace("https://", "")}/u/${me.handle}`}
              href={`/u/${me.handle}`}
            />
          )}

          <DropdownMenuSeparator className="my-1.5" />
          <Place
            icon={UsersIcon}
            title="People"
            about="Friends, who you follow, who follows you"
            href="/people"
          />
          <Place
            icon={HeadphonesIcon}
            title="Briefs"
            about="Two-voice audio briefs on your spaces"
            href="/briefs"
          />
          <Place
            icon={BrainIcon}
            title="What Konkyo knows"
            about="What it remembers about you; cross out what's wrong"
            href="/knows"
          />
          <Place
            icon={Trash2Icon}
            title="Trash"
            about="Deleted things wait here for 30 days"
            href={ROUTES.trash}
          />

          <DropdownMenuSeparator className="my-1.5" />
          <div className="flex gap-1">
            {APP.docs && (
              <DropdownMenuItem
                render={<a href={APP.docs} target="_blank" rel="noreferrer" />}
                className="flex-1 justify-center gap-1 rounded-xl py-2 text-snippet text-ash-gray"
              >
                Docs
                <ArrowUpRightIcon className="size-3" aria-hidden />
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              render={<Link href={"/made-with/zetaris" as Route} />}
              className="flex-1 justify-center rounded-xl py-2 text-snippet text-ash-gray"
            >
              Made with
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="my-1.5" />
          <DropdownMenuItem
            onClick={() => (isGuest ? setConfirmLeave(true) : void signOut())}
            className="gap-3 rounded-xl px-2 py-2 text-ui font-semibold text-bone-white"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-white/8">
              <LogOutIcon className="size-[18px]" strokeWidth={1.75} aria-hidden />
            </span>
            {isGuest ? "Leave this guest session" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* A guest has no way back in, so signing out is confirmed and keeping it is offered first. */}
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent showCloseButton={false}>
          <DialogTitle className="text-subhead font-normal">
            Sign out of this guest session?
          </DialogTitle>
          <DialogDescription className="text-ui text-ash-gray">
            Guests can't sign back in, so everything you made here is deleted. Keep it first, with
            an email code or Google, to take it with you.
          </DialogDescription>
          <DialogFooter className="mt-3 gap-2">
            <Button variant="ghost" onClick={() => void leaveAsGuest()}>
              Sign out and delete
            </Button>
            <Button
              onClick={() => {
                setConfirmLeave(false)
                keepAccount()
              }}
            >
              Keep it first
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
