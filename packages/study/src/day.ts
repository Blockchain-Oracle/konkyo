/** A calendar day as "YYYY-MM-DD" in the person's own time zone (a streak day is theirs). */
export function dayIn(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

const parse = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))

export function addDays(day: string, n: number): string {
  return new Date(parse(day) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((parse(b) - parse(a)) / 86_400_000)

/** The weekday's initial (S M T W T F S), for the streak strip. */
export const weekdayInitial = (day: string) => "SMTWTFS"[new Date(parse(day)).getUTCDay()] ?? ""
