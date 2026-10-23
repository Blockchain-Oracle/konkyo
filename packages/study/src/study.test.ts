import assert from "node:assert/strict"
import { test } from "node:test"
import { addDays } from "./day"
import { formatInterval, GRADES, gradeFor, newCard, preview, review } from "./fsrs"
import { quickGrade } from "./grade"
import { interleave } from "./interleave"
import { streakOf } from "./streak"

const now = new Date("2026-10-23T09:00:00Z")
const [Again, Hard, Good, Easy] = GRADES

test("a new card is due now and a harder grade never comes back later", () => {
  const card = newCard(now)
  assert.equal(card.due.getTime(), now.getTime())
  const next = preview(card, now)
  assert.ok(next[Again] <= next[Hard] && next[Hard] <= next[Good] && next[Good] <= next[Easy])
})

test("reviews spread out as an item keeps being recalled", () => {
  let card = newCard(now)
  let at = now
  const gaps: number[] = []
  for (let i = 0; i < 5; i++) {
    card = review(card, Good, at)
    gaps.push(card.due.getTime() - at.getTime())
    at = card.due
  }
  assert.ok((gaps.at(-1) ?? 0) > 7 * 86_400_000, "five good reviews reach a week or more")
  const lapsed = review(card, Again, at)
  assert.equal(lapsed.lapses, 1)
  const lapseGap = lapsed.due.getTime() - at.getTime()
  assert.ok(lapseGap < (gaps.at(-1) ?? 0) / 4, "a lapse comes back far sooner than the last gap")
})

test("how the attempt went picks the grade; Easy is never automatic", () => {
  assert.equal(gradeFor("right"), Good)
  assert.equal(gradeFor("helped"), Hard)
  assert.equal(gradeFor("shown"), Again)
})

test("intervals read as the grade buttons show them", () => {
  assert.equal(formatInterval(now, new Date(now.getTime() + 10 * 60_000)), "10m")
  assert.equal(formatInterval(now, new Date(now.getTime() + 3 * 86_400_000)), "3d")
  assert.equal(formatInterval(now, new Date(now.getTime() + 21 * 86_400_000)), "3w")
})

const today = "2026-10-23"
const done = (...offsets: number[]) =>
  offsets.map((o) => ({ day: addDays(today, o), kind: "done" as const }))

test("a streak counts back from today, or from yesterday before today's round", () => {
  assert.equal(streakOf(done(0, -1, -2), today, 0).current, 3)
  const notYet = streakOf(done(-1, -2), today, 0)
  assert.equal(notYet.current, 2)
  assert.equal(notYet.doneToday, false)
})

test("a held freeze covers a missed day and keeps the streak without adding to it", () => {
  const s = streakOf(done(-2, -3, -4), today, 1)
  assert.deepEqual(s.toFreeze, [addDays(today, -1)])
  assert.equal(s.current, 3)
})

test("with no freezes, a two-day gap offers a repair; a longer one starts again", () => {
  const s = streakOf(done(-3, -4, -5, -6), today, 0)
  assert.deepEqual(s.repair, { days: [addDays(today, -2), addDays(today, -1)], streak: 4 })
  assert.equal(s.current, 0)
  assert.equal(streakOf(done(-4, -5, -6), today, 0).repair, null)
})

test("the week strip leaves missed days empty", () => {
  const s = streakOf(done(0, -2), today, 0)
  assert.equal(s.week.length, 7)
  assert.equal(s.week[6]?.today, true)
  assert.equal(s.week[5]?.kind, null)
})

test("answers: typos and articles pass, a wrong number never does", () => {
  assert.equal(quickGrade("the hipocampus", ["hippocampus"]), "right")
  assert.equal(quickGrade("12 BLEU", ["28.4 BLEU"]), "wrong")
  assert.equal(quickGrade("28.4", ["28.4 BLEU"]), "unsure")
  assert.equal(quickGrade("", ["anything"]), "wrong")
})

test("interleaving never repeats a topic while another is waiting", () => {
  const items = ["a", "a", "a", "b", "b", "c"].map((topic, i) => ({ topic, i }))
  const order = interleave(items, (x) => x.topic).map((x) => x.topic)
  for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1])
})
