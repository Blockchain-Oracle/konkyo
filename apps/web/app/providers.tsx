"use client"

import { Toaster } from "@konkyo/ui/components/sonner"
import { TooltipProvider } from "@konkyo/ui/components/tooltip"
import { QueryClientProvider } from "@tanstack/react-query"
import { LazyMotion, MotionConfig } from "motion/react"
import { useEffect } from "react"
import { getQueryClient } from "@/lib/query-client"
import { primeSounds } from "@/lib/sounds"

/** Motion's features arrive just after the first paint (lib/motion-features.ts). */
const loadMotion = () => import("@/lib/motion-features").then((m) => m.default)

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  // The service worker (push, and the offline page) for everyone, once the page has loaded.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
    if (document.readyState === "complete") void register()
    else window.addEventListener("load", register, { once: true })
  }, [])
  // The first tap anywhere unlocks audio and fetches the interface sounds.
  useEffect(() => {
    const prime = () => primeSounds()
    window.addEventListener("pointerdown", prime, { once: true, capture: true })
    window.addEventListener("keydown", prime, { once: true, capture: true })
    return () => {
      window.removeEventListener("pointerdown", prime, { capture: true })
      window.removeEventListener("keydown", prime, { capture: true })
    }
  }, [])
  return (
    <QueryClientProvider client={queryClient}>
      {/* Respect the system "reduce motion" setting everywhere: movement goes, fades stay. */}
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotion}>
          <TooltipProvider>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  )
}
