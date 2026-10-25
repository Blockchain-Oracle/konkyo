"use client"

import { Button } from "@konkyo/ui/components/button"
import { Spinner } from "@konkyo/ui/components/spinner"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { pushState, turnOffPush, turnOnPush } from "@/lib/use-inbox"
import { useSettings } from "@/lib/use-settings"
import { SelectRow, SwitchRow } from "./setting-rows"

// 24-hour and locale-free, so the server's render and the browser's agree.
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}))

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
    <div className="setting-rows">
      <div className="setting-row">
        <p className="setting-text">
          <strong>Notifications on this device</strong>
          <span>
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
      <SwitchRow
        id="review-reminders"
        title="Daily review reminder"
        about="Only when cards are due and you haven't studied yet that day."
        checked={data?.reviewReminders ?? true}
        disabled={!data}
        onChange={(on) => save.mutate({ reviewReminders: on })}
      />
      <SelectRow
        title="Remind me at"
        about="Your time of day."
        value={String(data?.reminderHour ?? 18)}
        options={HOURS}
        disabled={!data || data.reviewReminders === false}
        onChange={(h) => save.mutate({ reminderHour: Number(h) })}
      />
      {data?.canEmail && (
        <SwitchRow
          id="weekly-digest"
          title="Weekly digest by email"
          about="Fridays at your reminder hour: what's new in your spaces, practice waiting, papers your watches found. Nothing to say, no email."
          checked={data.weeklyDigest}
          onChange={(on) => save.mutate({ weeklyDigest: on })}
        />
      )}
    </div>
  )
}
