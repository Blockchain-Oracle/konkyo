"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@konkyo/ui/components/resizable"
import { Sheet, SheetContent, SheetTitle } from "@konkyo/ui/components/sheet"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { closeAllSources, usePreview } from "@/lib/preview"
import { useMediaQuery } from "@/lib/use-source"
import { DockArea } from "../shell/dock"
import { SourcePane } from "./source-pane"

/**
 * The centre and the source side by side (plan §7.3). At 1024px and up the source is a resizable
 * pane (360px to 65%, 44% by default); below that it is a sheet over the page. The panel group is
 * always rendered, so opening a source never remounts the page underneath it.
 */
export function Workspace({ children }: { children: React.ReactNode }) {
  const { active } = usePreview()
  const wide = useMediaQuery("(min-width: 1024px)")
  const docked = Boolean(active) && wide

  // After a move to another page, keyboard focus lands on the page's content instead of falling
  // back to the top of the document. A page that focused a field of its own keeps that focus.
  const main = useRef<HTMLElement>(null)
  const pathname = usePathname()
  const moved = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each change of page
  useEffect(() => {
    if (!moved.current) {
      moved.current = true
      return
    }
    const lost = !document.activeElement || document.activeElement === document.body
    if (lost) main.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <>
      {/* The group sets an inline height of 100%, so the screen height lives on this wrapper. */}
      <div className="lg:h-svh">
        <ResizablePanelGroup orientation="horizontal" className="max-lg:overflow-visible!">
          {/* Below lg the page scrolls itself: the panel's own overflow:hidden would break sticky. */}
          <ResizablePanel
            id="centre"
            minSize={360}
            className="max-lg:overflow-visible! lg:overflow-y-auto!"
          >
            <main id="main" ref={main} tabIndex={-1} className="outline-none">
              {children}
            </main>
          </ResizablePanel>
          {docked && (
            <>
              <ResizableHandle className="bg-white/10 hover:bg-lime/60" />
              <ResizablePanel
                id="source"
                defaultSize="44%"
                minSize={360}
                maxSize="65%"
                className="animate-pane-in"
              >
                <SourcePane />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <DockArea />
      {!wide && (
        <Sheet open={Boolean(active)} onOpenChange={(open) => !open && closeAllSources()}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="gap-0 border-l border-border p-0 data-[side=right]:w-[calc(100%-1.5rem)] data-[side=right]:sm:max-w-[560px]"
          >
            <SheetTitle className="sr-only">Source</SheetTitle>
            <SourcePane />
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
