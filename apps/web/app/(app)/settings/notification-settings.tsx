"use client"

import { Button } from "@konkyo/ui/components/button"
import { Checkbox } from "@konkyo/ui/components/checkbox"
import { Spinner } from "@konkyo/ui/components/spinner"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { pushState, turnOffPush, turnOnPush } from "@/lib/use-inbox"
import { useSettings } from "@/lib/use-settings"

const HOURS = Array.from({ length: 24 }, (_, h) => h)
// 24-hour and locale-free, so the server's render and the browser's agree.
const label = (h: number) => `${String(h).padStart(2, "0")}:00`

/**
 * Notifications (plan F41, F42): Web Push on this device (asked only on the person's click), and
 * the daily review reminder at their chosen hour, sent only when something is due.
 */
export function NotificationSettings() {
  const { settings: data, save } = useSettings()
  const [push, setPush] = useState<Awaited<ReturnType<typeof pushState>> | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void pushState().then(setPush)
  }, [])
  const toggle = async () => {
    setBusy(true)
    try {
      if (push === "on") await turnOffPush()
      else {
        await turnOnPush()
        await api("/api/push/test", { method: "POST" })
      }
      setPush(await pushState())
    } catch (error) {
      toast.error((error as Error).message)
      setPush(await pushState())
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="divide-y divide-border border-y border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <p className="text-ui text-bone-white">
          Notifications on this device
          <span className="mt-0.5 block text-snippet text-ash-gray">
            {push === "unsupported"
              ? "This browser can't receive them. On iPhone, add Konkyo to your Home Screen first."
              : push === "denied"
                ? "Blocked in your browser's site settings. Allow them there, then come back."
                : "Review reminders and finished agent runs, even when Konkyo isn't open."}
          </span>
        </p>
        <Button
          variant={push === "on" ? "ghost" : "secondary"}
          size="sm"
          disabled={busy || push === null || push === "unsupported" || push === "denied"}
          onClick={() => void toggle()}
        >
          {busy && <Spinner />}
          {push === "on" ? "Turn off" : "Turn on"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="review-reminders"
            checked={data?.reviewReminders ?? true}
            disabled={!data}
            onCheckedChange={(on) => save.mutate({ reviewReminders: Boolean(on) })}
            className="mt-0.5"
          />
          <label htmlFor="review-reminders" className="text-ui text-bone-white">
            Daily review reminder
            <span className="mt-0.5 block text-snippet text-ash-gray">
              Only when cards are due and you haven't studied yet that day.
            </span>
          </label>
        </div>
        <select
          aria-label="Reminder time"
          value={data?.reminderHour ?? 18}
          disabled={!data || data.reviewReminders === false}
          onChange={(e) => save.mutate({ reminderHour: Number(e.target.value) })}
          className="h-9 rounded-lg border border-border bg-raised px-2.5 text-ui text-bone-white disabled:opacity-50"
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {label(h)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
