"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@konkyo/ui/components/resizable"
import { Sheet, SheetContent, SheetTitle } from "@konkyo/ui/components/sheet"
import { closeAllSources, usePreview } from "@/lib/preview"
import { useMediaQuery } from "@/lib/use-source"
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

  return (
    <>
      {/* The group sets an inline height of 100%, so the screen height lives on this wrapper. */}
      <div className="lg:h-svh">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="centre" minSize={360} className="lg:overflow-y-auto!">
            {children}
          </ResizablePanel>
          {docked && (
            <>
              <ResizableHandle className="bg-border hover:bg-line-strong" />
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
      {!wide && (
        <Sheet open={Boolean(active)} onOpenChange={(open) => !open && closeAllSources()}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="gap-0 border-l border-border p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]"
          >
            <SheetTitle className="sr-only">Source</SheetTitle>
            <SourcePane />
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
