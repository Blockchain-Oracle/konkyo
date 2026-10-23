/** An agent's schedule (plan F34): every day, or every week on one weekday, at an hour. */
export type Schedule = { every: "day" | "week"; weekday?: number; hour: number }

const parts = (date: Date, timeZone: string) => {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date)
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    f.find((p) => p.type === "weekday")?.value ?? "",
  )
  return { weekday, hour: Number(f.find((p) => p.type === "hour")?.value) }
}

/**
 * The next time the schedule fires after `after`, in the person's own time zone: walks forward
 * hour by hour (at most eight days), so daylight-saving changes need no special case.
 */
export function nextRunAt(schedule: Schedule, timeZone: string, after = new Date()): Date {
  const start = new Date(after)
  start.setUTCMinutes(0, 0, 0)
  for (let i = 1; i <= 24 * 8; i++) {
    const at = new Date(start.getTime() + i * 3_600_000)
    let local: { weekday: number; hour: number }
    try {
      local = parts(at, timeZone)
    } catch {
      local = parts(at, "UTC")
    }
    if (local.hour !== schedule.hour) continue
    if (schedule.every === "week" && local.weekday !== (schedule.weekday ?? 1)) continue
    return at
  }
  return new Date(after.getTime() + 86_400_000)
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** "Every day at 08:00", "Every Monday at 18:00". */
export function describeSchedule(schedule: Schedule) {
  const hour = `${String(schedule.hour).padStart(2, "0")}:00`
  return schedule.every === "day"
    ? `Every day at ${hour}`
    : `Every ${WEEKDAYS[schedule.weekday ?? 1]} at ${hour}`
}
