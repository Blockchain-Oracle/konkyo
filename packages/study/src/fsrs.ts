import { type Card, createEmptyCard, fsrs, type Grade, Rating, State } from "ts-fsrs"

/** One item's FSRS state as it's stored (one row per item). */
export type CardState = {
  due: Date
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: number
  lastReview: Date | null
}

/** FSRS's four grades, by the number key that picks them in a session. */
export const GRADES = [
  Rating.Again,
  Rating.Hard,
  Rating.Good,
  Rating.Easy,
] as const satisfies Grade[]
export type GradeValue = (typeof GRADES)[number]
export const GRADE_LABEL: Record<GradeValue, string> = {
  [Rating.Again]: "Again",
  [Rating.Hard]: "Hard",
  [Rating.Good]: "Good",
  [Rating.Easy]: "Easy",
}

/**
 * 90% target recall (FSRS's default), fuzzed so items made together don't all fall due on the
 * same day, and capped at a year: the library is for this term's work. No same-day steps: a
 * round already brings back what was missed before it ends, so FSRS only schedules days.
 */
const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: false,
  maximum_interval: 365,
})

const toCard = (c: CardState): Card => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: 0,
  scheduled_days: c.scheduledDays,
  learning_steps: c.learningSteps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state as State,
  last_review: c.lastReview ?? undefined,
})

const fromCard = (c: Card): CardState => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  lastReview: c.last_review ?? null,
})

/** A new item: due now, so it can be practised straight away. */
export const newCard = (now: Date): CardState => fromCard(createEmptyCard(now))

export const isNew = (card: CardState) => card.state === State.New

/** The card after a review with this grade, and when it's due next. */
export function review(card: CardState, grade: GradeValue, now: Date): CardState {
  return fromCard(scheduler.next(toCard(card), now, grade).card)
}

/** When the card would be due for each grade (shown on the grade buttons). */
export function preview(card: CardState, now: Date): Record<GradeValue, Date> {
  const all = scheduler.repeat(toCard(card), now)
  return {
    [Rating.Again]: all[Rating.Again].card.due,
    [Rating.Hard]: all[Rating.Hard].card.due,
    [Rating.Good]: all[Rating.Good].card.due,
    [Rating.Easy]: all[Rating.Easy].card.due,
  }
}

/**
 * How the attempt went, as FSRS reads it: right first time is Good; right after a try, a hint or
 * both is Hard; seeing the answer is Again. Easy is only ever the person's own call.
 */
export type Outcome = "right" | "helped" | "shown"

export function gradeFor(outcome: Outcome): GradeValue {
  if (outcome === "right") return Rating.Good
  if (outcome === "helped") return Rating.Hard
  return Rating.Again
}

/** "10m", "1d", "3w", "4mo": how long until a due date, as the grade buttons show it. */
export function formatInterval(from: Date, to: Date): string {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${Math.round(days / 365)}y`
}
