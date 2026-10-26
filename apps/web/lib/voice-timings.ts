/*
 * The voice moment's clock, in one table. Every beat of an ask (speech, when the card kind is
 * known, when each part lands, the pause, the close) reads its length from here. Each row names
 * where its number comes from: "measured" (a median out of an eval run), "derived" (arithmetic on
 * measured numbers), "code" (a rule the live code runs on), "assumed" (a defensible pick, never
 * faster than what was measured around it), "design" (how long our own animation takes).
 * `?slow=3` plays every one of these at a third of the speed.
 */

export type TimingKind = "measured" | "derived" | "code" | "assumed" | "design"
export type Timing = { ms: number; kind: TimingKind; source: string; note: string }

const t = (ms: number, kind: TimingKind, source: string, note: string): Timing => ({
  ms,
  kind,
  source,
  note,
})

export const VOICE_TIMINGS = {
  // ---- speech (scripted asks: `?voice=…&voicePace=talk`) ----
  wordBase: t(200, "measured", "voice eval s1-speed", "a scripted word takes 200 ms…"),
  wordPerSyllable: t(
    70,
    "measured",
    "voice eval s1-speed",
    "…plus 70 ms per syllable, about 180 words a minute",
  ),
  wordGap: t(30, "code", "lib/voice.ts runScript", "the breath between two scripted words"),
  hesitation: t(900, "measured", "voice eval s1-speed", '"…" in a script is 900 ms'),

  // ---- which card ----
  typeAtKeyword: t(
    0,
    "measured",
    "voice eval s1-speed",
    "a kind word in the sentence: code names the card the frame the word lands",
  ),
  steady: t(
    200,
    "code",
    "lib/voice-build.ts STEADY_MS",
    "no kind named yet: words unchanged this long go to the intent model",
  ),

  // ---- the end of the ask, from the last word ----
  pauseQuiet: t(
    650,
    "code",
    "lib/voice.ts PAUSE_MS",
    "quiet after the last word that ends the ask",
  ),
  pauseHang: t(1600, "code", "lib/voice.ts HANG_MS", 'the same when the words hang on "for…"'),

  // ---- what nobody measured ----
  partBeat: t(
    40,
    "assumed",
    "no measurement",
    "parts landing one by one: the house stagger; the card is complete on screen later than the pipeline, never sooner",
  ),
  numberTick: t(
    360,
    "assumed",
    "no measurement",
    "a number counting up to its value: one arrival long",
  ),
  closeHold: t(
    320,
    "assumed",
    "no measurement",
    "the finished card held on the stage before it lets go: long enough to read as whole",
  ),
  followUpWait: t(
    4000,
    "assumed",
    "no measurement",
    "a card named with nothing to put in it: how long the stage waits for more words",
  ),
  replyHold: t(
    1800,
    "assumed",
    "no measurement",
    "a slip held on the stage before the room takes over: long enough to read one line",
  ),
  foundHold: t(700, "assumed", "no measurement", "it is already here: how long the stage says so"),

  // ---- our own motion ----
  stageOpen: t(
    760,
    "design",
    "voice-stage.tsx",
    "the orb's flight from the dock to its place on the stage",
  ),
  cardPop: t(360, "design", "--dur-arrive", "the card's skeleton arriving on the stage"),
  partArrive: t(220, "design", "--dur-base", "one part's own arrival"),
  orbHome: t(500, "design", "--dur-stage", "the orb's flight back to the dock"),
  cardTravel: t(500, "design", "--dur-stage", "the card's travel from the stage to where it lives"),

  // ---- Konkyo's own rows ----
  answerSlip: t(
    2600,
    "assumed",
    "no measurement",
    "Konkyo: a spoken answer's slip held on the stage when read-aloud is off (two short lines)",
  ),
  followUpListen: t(
    8000,
    "code",
    "plan §16.5",
    "Konkyo: after an answer the orb keeps listening this long for a follow-up",
  ),
  bargeIn: t(
    260,
    "assumed",
    "no measurement",
    "Konkyo: your voice this long over its voice stops it talking (echo cancellation keeps its own out)",
  ),
  tapeHold: t(
    4200,
    "assumed",
    "no measurement",
    "Konkyo: the answer slip stays taped to its source on the wall this long",
  ),
} as const satisfies Record<string, Timing>

export type TimingName = keyof typeof VOICE_TIMINGS

/** `?slow=3` → 3: every beat takes three times as long. 1 at real speed. */
export function voiceSlow(): number {
  if (typeof window === "undefined") return 1
  const n = Number(new URLSearchParams(window.location.search).get("slow"))
  return n >= 1 && n <= 10 ? n : 1
}

/** A beat's length in this session: the table's number at the session's speed. */
export function beat(name: TimingName): number {
  return VOICE_TIMINGS[name].ms * voiceSlow()
}
