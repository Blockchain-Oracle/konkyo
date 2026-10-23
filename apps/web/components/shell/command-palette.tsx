"use client"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@konkyo/ui/components/command"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { FOOTER_NAV, MAIN_NAV } from "@/lib/navigation"

const GO_TO = [...MAIN_NAV, ...FOOTER_NAV]

/** ⌘K / Ctrl+K anywhere. It opens with no animation: it's used many times a day. */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function go(href: Route) {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search and go"
      description="Jump anywhere in Konkyo"
    >
      <Command>
        <CommandInput placeholder="Go to…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            {GO_TO.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <item.icon strokeWidth={1.5} />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
