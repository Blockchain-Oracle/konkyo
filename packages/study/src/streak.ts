import { addDays, daysBetween } from "./day"

/**
 * A streak day: "done" is a finished review set or game round with real recall,
 * "freeze" a missed day a freeze covered, "repair" a missed day won back by two rounds.
 */
export type DayKind = "done" | "freeze" | "repair"
export type StreakDay = { day: string; kind: DayKind }

export const MAX_FREEZES = 2
/** A missed stretch this short can still be repaired; longer, and the streak starts again. */
export const REPAIR_WINDOW = 2
/** Rounds in one day that repair a broken streak. */
export const REPAIR_ROUNDS = 2

export type Streak = {
  /** Days studied in the unbroken run that ends today or yesterday (covered days keep it, not add). */
  current: number
  doneToday: boolean
  /** The last seven days, oldest first; a missed day is simply empty, never marked. */
  week: { day: string; kind: DayKind | null; today: boolean }[]
  /** Missed days a held freeze covers now (the caller stores them and spends the freezes). */
  toFreeze: string[]
  /** A streak broken in the last couple of days that two rounds today bring back. */
  repair: { days: string[]; streak: number } | null
}

/** Studied days in the run that ends on `end` (walking back while days are covered). */
function runEndingAt(byDay: Map<string, DayKind>, end: string) {
  let count = 0
  for (let day = end; byDay.has(day); day = addDays(day, -1)) if (byDay.get(day) === "done") count++
  return count
}

export function streakOf(days: StreakDay[], today: string, freezes: number): Streak {
  const byDay = new Map(days.map((d) => [d.day, d.kind]))
  const doneToday = byDay.get(today) === "done"
  const before = [...byDay.keys()].filter((d) => d < today).sort()
  const last = before.at(-1)

  let toFreeze: string[] = []
  let repair: Streak["repair"] = null
  if (last) {
    const missed = Array.from({ length: Math.max(0, daysBetween(last, today) - 1) }, (_, i) =>
      addDays(last, i + 1),
    )
    if (missed.length && missed.length <= freezes) {
      toFreeze = missed
      for (const day of missed) byDay.set(day, "freeze")
    } else if (missed.length && missed.length <= REPAIR_WINDOW) {
      const streak = runEndingAt(byDay, last)
      if (streak > 1) repair = { days: missed, streak }
    }
  }

  const end = byDay.has(today) ? today : addDays(today, -1)
  const current = runEndingAt(byDay, end)
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6)
    return { day, kind: byDay.get(day) ?? null, today: day === today }
  })
  return { current, doneToday, week, toFreeze, repair }
}

/** A freeze back every seven studied days, up to the cap. */
export const freezesAfter = (freezes: number, current: number) =>
  current > 0 && current % 7 === 0 ? Math.min(MAX_FREEZES, freezes + 1) : freezes

/** Day 7, then every seventh day: the ones worth a celebration. */
export const isMilestone = (current: number) => current > 0 && current % 7 === 0
