"use client"

import { Toaster } from "@konkyo/ui/components/sonner"
import { TooltipProvider } from "@konkyo/ui/components/tooltip"
import { QueryClientProvider } from "@tanstack/react-query"
import { domAnimation, LazyMotion, MotionConfig } from "motion/react"
import { getQueryClient } from "@/lib/query-client"

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {/* Respect the system "reduce motion" setting everywhere: movement goes, fades stay. */}
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation}>
          <TooltipProvider>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  )
}
