"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@konkyo/ui/components/popover"
import { Switch } from "@konkyo/ui/components/switch"
import { Toolbar } from "@konkyo/ui/components/toolbar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { cn } from "@konkyo/ui/lib/utils"
import { ArrowUpIcon, MessagesSquareIcon, Music2Icon, SparklesIcon, XIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { type Focus, WHOLE_LIBRARY } from "@/lib/focus"
import { holdQuestion } from "@/lib/pending-question"
import { interfaceSoundsOn, setInterfaceSounds, sound } from "@/lib/sounds"
import { useUnread } from "@/lib/use-inbox"
import { useCurrentSpaceId } from "./rail"

/** Pages with their own composer or no content to ask about don't show the dock (R2). */
const NO_DOCK = [
  /^\/chats\/[^/]+/,
  /^\/write\/[^/]+/,
  /^\/study\/session/,
  /^\/settings/,
  /^\/trash/,
]

export function useDockVisible() {
  const pathname = usePathname()
  return !NO_DOCK.some((re) => re.test(pathname))
}

/**
 * The orb's seat (plan §16.5). Until the voice stage lands (S16) the orb is a still: tapping it
 * opens the ask strip, the same as the pill. It breaks the dock's top edge, as in OurSpaces.
 */
function OrbSeat({ onPress, open }: { onPress: () => void; open: boolean }) {
  return (
    <Toolbar.Button
      onClick={onPress}
      aria-label="Ask"
      className={cn(
        "relative -my-2 grid size-14 shrink-0 -translate-y-1.5 place-items-center rounded-full transition-[translate,scale] duration-(--dur-arrive) ease-(--ease-pop) hover:-translate-y-2.5",
        open && "scale-90",
      )}
    >
      {/* The orb's colours (violet → pink → orange through a glass highlight): the one place a
          gradient is allowed, as in OurSpaces. */}
      <span
        aria-hidden
        className="size-12 rounded-full shadow-[0_6px_18px_-6px_rgb(233_54_157/0.7)]"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.85) 0 7%, transparent 18%), radial-gradient(circle at 70% 75%, #ff7c42 0, transparent 55%), radial-gradient(circle at 25% 70%, #7853ff 0, transparent 60%), #e9369d",
        }}
      />
    </Toolbar.Button>
  )
}

/**
 * The dock (plan §16.6, OurSpaces ActionDock): floats at the bottom of the page. The orb, "ask
 * anything", ✦ what moved, chats, and sounds. Asking from a space's page asks that space.
 */
export function Dock() {
  const router = useRouter()
  const spaceId = useCurrentSpaceId()
  const { data: unread } = useUnread()
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState("")
  const [soundsOn, setSoundsOn] = useState(true)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setSoundsOn(interfaceSoundsOn()), [])
  useEffect(() => {
    if (asking) input.current?.focus()
  }, [asking])

  const open = () => {
    sound("tap")
    setAsking(true)
  }
  const close = () => {
    setAsking(false)
    setText("")
  }
  const ask = () => {
    const question = text.trim()
    if (!question) return
    const focus: Focus = spaceId ? { fileIds: [], folderIds: [spaceId] } : WHOLE_LIBRARY
    const chatId = crypto.randomUUID()
    holdQuestion(chatId, { text: question, focus })
    sound("place")
    close()
    router.push(`/chats/${chatId}` as Route)
  }

  return (
    <Toolbar.Root
      aria-label="Dock"
      className="pointer-events-auto flex h-14 items-center gap-1 rounded-full bg-sticker py-1 pr-1.5 pl-1 text-white shadow-dark ring-1 ring-white/6"
    >
      <OrbSeat onPress={open} open={asking} />

      {asking ? (
        <form
          className="flex min-w-0 animate-pill-in items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            ask()
          }}
        >
          <Toolbar.Input
            ref={input}
            value={text}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) =>
              event.key === "Escape" && close()
            }
            placeholder={spaceId ? "ask this space anything…" : "ask your library anything…"}
            aria-label="Your question"
            className="h-10 w-[min(56vw,420px)] bg-transparent px-2 text-reading text-white caret-lime outline-none placeholder:text-room-muted"
          />
          <Toolbar.Button
            type="submit"
            aria-label="Ask"
            disabled={!text.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-ink transition-opacity disabled:opacity-35"
          >
            <ArrowUpIcon className="size-4.5" strokeWidth={2.5} />
          </Toolbar.Button>
          <Toolbar.Button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full text-room-muted hover:bg-white/8 hover:text-white"
          >
            <XIcon className="size-4.5" />
          </Toolbar.Button>
        </form>
      ) : (
        <>
          <Toolbar.Button
            onClick={open}
            className="h-10 rounded-full px-3 text-left text-ui font-semibold whitespace-nowrap text-white/90 hover:bg-white/8"
          >
            {spaceId ? "ask this space" : "ask anything"}
          </Toolbar.Button>
          <Toolbar.Separator className="mx-1 h-6 w-px bg-white/14" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Toolbar.Link
                  render={<Link href="/inbox" onClick={() => sound("tap")} />}
                  className="relative grid size-10 place-items-center rounded-full text-lime hover:bg-white/8"
                />
              }
            >
              <SparklesIcon className="size-4.5" strokeWidth={2} />
              <span className="sr-only">What moved</span>
              {unread ? (
                <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-ink tabular-nums">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </TooltipTrigger>
            <TooltipContent>what moved</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Toolbar.Link
                  render={<Link href="/chats" onClick={() => sound("tap")} />}
                  className="grid size-10 place-items-center rounded-full text-white/90 hover:bg-white/8"
                />
              }
            >
              <MessagesSquareIcon className="size-4.5" strokeWidth={1.75} />
              <span className="sr-only">Chats</span>
            </TooltipTrigger>
            <TooltipContent>chats</TooltipContent>
          </Tooltip>
          <Popover>
            <PopoverTrigger
              render={
                <Toolbar.Button
                  aria-label="Sounds"
                  className="grid size-10 place-items-center rounded-full text-white/90 hover:bg-white/8 data-popup-open:bg-white/8"
                />
              }
            >
              <Music2Icon className="size-4.5" strokeWidth={1.75} />
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={14} className="w-64">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ui font-semibold">interface sounds</span>
                <Switch
                  aria-label="Interface sounds"
                  checked={soundsOn}
                  onCheckedChange={(on) => {
                    setSoundsOn(on)
                    setInterfaceSounds(on)
                  }}
                />
              </div>
              <p className="mt-1.5 text-meta text-room-muted">
                soft clicks when you tap, add and check.
              </p>
            </PopoverContent>
          </Popover>
        </>
      )}
    </Toolbar.Root>
  )
}

/** Where the dock sits: the bottom of the centre column, above the phone bar. */
export function DockArea() {
  const visible = useDockVisible()
  if (!visible) return null
  return (
    <div className="pointer-events-none sticky bottom-0 z-30 flex justify-center px-3 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-5">
      <Dock />
    </div>
  )
}
