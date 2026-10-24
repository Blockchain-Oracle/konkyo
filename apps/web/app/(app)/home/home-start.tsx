"use client"

import { SPACES } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { CSSProperties } from "react"
import { toast } from "sonner"
import { StarterTasks } from "@/components/onboarding/starter-tasks"
import { PageShell } from "@/components/page-shell"
import { openSpaceMaker } from "@/components/shell/app-dialogs"
import { TEMPLATES } from "@/components/shell/space-maker"
import { api } from "@/lib/fetcher"
import { sound } from "@/lib/sounds"
import { useFiles } from "@/lib/use-library"
import { useMe } from "@/lib/use-me"
import { useSettings } from "@/lib/use-settings"
import { FromPeople } from "./home-room"

/** What each starting piece of a template turns into, said plainly. */
const PIECES = { find: "a search for sources", watch: "a weekly watch", quiz: "a monday quiz" }

/**
 * First run (plan F39 → F53): "what are you here for?" is the chooser for your first space. A
 * template opens the space maker on it; below, the three starters run for real on open material.
 * Making a space, a starter, or skip ends first run for good.
 */
export function HomeStart({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings()
  const { data: files } = useFiles()
  const { me } = useMe()
  const queryClient = useQueryClient()
  const skip = useMutation({
    mutationFn: () => api("/api/onboarding/skip", { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["settings"] }),
    onError: (error: Error) => toast.error(error.message),
  })
  const firstRun = settings && files && !settings.onboarded && files.length === 0
  if (!firstRun) return children
  const hello = me ? `welcome, ${me.name.toLowerCase()}` : "welcome to konkyo"
  return (
    <PageShell title="what are you here for?" kicker={hello} bare>
      <section aria-label="Make your first space" className="first-run">
        {/* followed someone before adding a file: what they published comes first */}
        <FromPeople />
        <ul className="first-run-templates">
          {TEMPLATES.map((template, i) => {
            const hex = SPACES.colors[template.color].hex
            return (
              <li key={template.id} style={{ "--i": i } as CSSProperties}>
                <button
                  type="button"
                  className="first-run-template"
                  style={{ "--space": hex, "--space-ink": readableInk(hex) } as CSSProperties}
                  onClick={() => {
                    sound("tap")
                    openSpaceMaker(template.id)
                  }}
                >
                  <span className="first-run-symbol" aria-hidden="true">
                    {`${template.symbol}︎`}
                  </span>
                  <strong>{template.name}</strong>
                  <span className="first-run-line">{template.line}</span>
                  <span className="first-run-pieces">
                    {template.pieces.length
                      ? `starts with ${template.pieces.map((p) => PIECES[p]).join(" and ")}`
                      : "starts empty: bring what you're reading"}
                  </span>
                  <span className="first-run-go">
                    make it <span aria-hidden="true">→</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="first-run-samples">
          <h2>or see it work on open material first</h2>
          <p>
            One tap runs it for real, so you can watch every answer point to the passage it came
            from.
          </p>
          <StarterTasks className="mt-5" />
          <button
            type="button"
            onClick={() => skip.mutate()}
            disabled={skip.isPending}
            className="first-run-skip"
          >
            skip. I&apos;ll add my own files.
          </button>
        </div>
      </section>
    </PageShell>
  )
}
