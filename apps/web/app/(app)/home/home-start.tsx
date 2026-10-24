"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { StarterTasks } from "@/components/onboarding/starter-tasks"
import { PageShell } from "@/components/page-shell"
import { api } from "@/lib/fetcher"
import { useFiles } from "@/lib/use-library"
import { useSettings } from "@/lib/use-settings"

/**
 * First run (plan F39): an empty library that hasn't chosen yet leads with "What are you here
 * for?" and the three starters, run for real. Skip, or any starter, ends first run for good.
 */
export function HomeStart({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings()
  const { data: files } = useFiles()
  const queryClient = useQueryClient()
  const skip = useMutation({
    mutationFn: () => api("/api/onboarding/skip", { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["settings"] }),
    onError: (error: Error) => toast.error(error.message),
  })
  const firstRun = settings && files && !settings.onboarded && files.length === 0
  if (!firstRun) return children
  return (
    <PageShell title="what are you here for?" kicker="welcome to konkyo">
      <section aria-label="Start">
        <p className="max-w-2xl text-reading text-pretty text-silver-mist">
          Pick one and Konkyo runs it for real on open material, so you can see every answer point
          to the passage it came from.
        </p>
        <StarterTasks className="mt-9" />
        <button
          type="button"
          onClick={() => skip.mutate()}
          disabled={skip.isPending}
          className="mt-6 text-snippet text-ash-gray underline decoration-current/30 underline-offset-4 hover:text-bone-white"
        >
          Skip. I'll add my own files.
        </button>
      </section>
    </PageShell>
  )
}
