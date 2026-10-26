/**
 * What a spoken ask wants. Code reads the words first, on
 * every new word and in no time (patterns below); only words no pattern places go to the cheap
 * model (`intent-model.ts`, server). Pure: the browser imports this file (`@konkyo/agents/intent`).
 *
 * The kinds: ask (the answer pipeline, scoped to where you are) · find (deep search) · quiz (make
 * practice) · note · brief (audio brief) · space (a new space) · catchup · remember (a spoken
 * correction) · show (where the last answer says it) · done (end the conversation).
 */

export type VoiceKind =
  | "ask"
  | "find"
  | "quiz"
  | "note"
  | "brief"
  | "space"
  | "catchup"
  | "remember"
  | "show"
  | "done"

export type Intent = {
  kind: VoiceKind
  /** What it is about: the question, the topic to search, what to quiz on, the note's or space's name. */
  topic: string
  /** "quiz me with 5 questions" */
  count?: number
  /** The words that named the kind (word indices, inclusive): they become the sticker on the stage. */
  cue?: [number, number]
  /** The second thing in one breath ("…and quiz me on them"); it waits on the first. */
  and?: Intent
}

/** Kinds that make a card on the stage; the rest answer with a slip or act at once. */
export const CARD_KINDS: VoiceKind[] = ["ask", "find", "quiz", "note", "brief", "space", "remember"]

const NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
}

/** Each kind's words, most specific first. The first group is the cue. */
const PATTERNS: Array<{ kind: VoiceKind; re: RegExp }> = [
  {
    kind: "done",
    re: /^(?:ok(?:ay)?,? )?(that'?s all|that is all|thanks?(?: you)?|never ?mind|nothing else|i'?m done|stop)\b/i,
  },
  {
    kind: "show",
    re: /\b(show me where|where does it say|where did (?:it|you) (?:say|get) that|show me the (?:passage|quote|source))\b/i,
  },
  {
    kind: "remember",
    re: /^(?:no,? )?(that'?s (?:wrong|not right|incorrect)|that is (?:wrong|not right)|actually,? (?:it|the|they)\b|remember that|correction)/i,
  },
  {
    kind: "catchup",
    re: /\b(catch me up|what(?:'s| has| have)? (?:changed|new|moved)|what did i miss)\b/i,
  },
  {
    kind: "quiz",
    re: /\b(quiz me|test me|drill me|practi[cs]e(?: questions)?|flash ?cards?|make (?:me )?(?:a )?(?:quiz|test))\b/i,
  },
  {
    kind: "brief",
    re: /\b(audio brief|brief me|a brief|podcast|(?:make|record) (?:me )?(?:an? )?(?:audio|brief))\b/i,
  },
  {
    kind: "find",
    re: /\b((?:find|search(?: for)?|look (?:for|up)|get me|dig up|pull up)\b(?: me)?(?: some| more| new| a few)? (?:papers?|sources?|articles?|studies|research|readings?|reviews?)|deep search)\b/i,
  },
  {
    kind: "note",
    re: /\b((?:new|start|make|write|take|open)(?: me)? (?:a )?note|note (?:down|that))\b/i,
  },
  {
    kind: "space",
    re: /\b((?:new|make|create|start|set up|open)(?: me)?(?: a)?(?: new)? space)\b/i,
  },
  {
    kind: "ask",
    re: /^(?:so,? |and,? |okay,? |ok,? |hey,? |konkyo,? )*(where|what|which|who|whom|whose|why|how|when|is|are|was|were|do|does|did|can|could|should|would|will|has|have|compare|summari[sz]e|explain|describe|list|tell me|give me|walk me through|help me understand)\b/i,
  },
]

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean)

/** Word index of a character offset. */
function wordAt(text: string, offset: number) {
  return words(text.slice(0, offset)).length - (/\S$/.test(text.slice(0, offset)) ? 1 : 0)
}

function match(text: string): { kind: VoiceKind; cue: [number, number]; at: number } | null {
  let best: { kind: VoiceKind; cue: [number, number]; at: number } | null = null
  for (const { kind, re } of PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    const group = m[1] ?? m[0]
    const start = m.index + m[0].indexOf(group)
    const from = wordAt(text, start)
    const to = from + words(group).length - 1
    // the action named earliest wins ("find papers … and quiz me" is a find, then a quiz); an
    // ask only when nothing else is named
    if (kind === "ask" && best) continue
    if (!best || best.kind === "ask" || start < best.at) best = { kind, cue: [from, to], at: start }
  }
  return best
}

/** What follows a preposition, cut at the end of the clause: "papers on sleep and memory" → "sleep and memory". */
function about(text: string) {
  const m =
    /^(?:.*?\s)?(?:on|about|regarding|for|into|around|covering|called|named|titled)\s+(.+)$/i.exec(
      text,
    )
  return (m?.[1] ?? "").replace(/[.?!,;:]+$/, "").trim()
}

function countIn(text: string) {
  const m =
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s+(?:questions?|cards?|items?|flash ?cards?|papers?|sources?)\b/i.exec(
      text,
    )
  const said = m?.[1]
  if (!said) return undefined
  const n = Number(said) || NUMBERS[said.toLowerCase()] || 0
  return n > 0 ? n : undefined
}

/** "this space", "them", "here": where you are (or, chained, what the first ask made). */
const HERE =
  /^(?:them|these|those|it|that|this|here|this space|this folder|these papers|these sources|everything(?: here)?|my library|all of (?:it|them))$/i

function topicFor(kind: VoiceKind, text: string, cue: [number, number]): string {
  const clean = text.replace(/[.?!,;:]+$/, "").trim()
  switch (kind) {
    case "ask":
    case "show":
    case "catchup":
    case "done":
      return clean
    case "remember":
      return clean
        .replace(
          /^(?:no,? )?(?:that'?s (?:wrong|not right|incorrect)|that is (?:wrong|not right)|remember that|correction)[,.:]?\s*/i,
          "",
        )
        .trim()
    default: {
      // what comes after the words that named it: "find papers | on sleep" → "sleep"
      const rest = words(clean)
        .slice(cue[1] + 1)
        .join(" ")
        .replace(/^(?:some|more|new|a few|me)\s+/i, "")
        .replace(/^(?:papers?|sources?|articles?|studies|research|readings?|reviews?)\b\s*/i, "")
      const said =
        about(rest) ||
        rest.replace(/^(?:with\s+)?\S+\s+(?:questions?|cards?|items?)\s*/i, "").trim()
      return HERE.test(said) ? "" : said
    }
  }
}

/**
 * The intent of these words by code alone, or null when no pattern places them (the model's turn).
 * Two kinds in one breath ("find papers on sleep and quiz me on them") come back chained: the
 * split is the "and" just before the second kind's words.
 */
export function guessIntent(text: string): Intent | null {
  const said = text.trim()
  if (!said) return null
  const first = match(said)
  if (!first) return null
  const all = words(said)
  // a second action later in the sentence, after an "and"/"then"
  if (first.kind !== "ask" && first.kind !== "done") {
    const tail = all.slice(first.cue[1] + 1)
    for (let i = 0; i < tail.length; i++) {
      if (!/^(?:and|then)$/i.test(tail[i] ?? "")) continue
      const rest = tail
        .slice(i + 1)
        .join(" ")
        .replace(/^then\s+/i, "")
      const second = match(rest)
      if (!second || second.kind === "ask" || second.kind === first.kind) continue
      if (second.at > 6) continue
      const head = all.slice(0, first.cue[1] + 1 + i).join(" ")
      return {
        kind: first.kind,
        topic: topicFor(first.kind, head, first.cue),
        count: countIn(head),
        cue: first.cue,
        and: {
          kind: second.kind,
          topic: topicFor(second.kind, rest, second.cue),
          count: countIn(rest),
          cue: [first.cue[1] + 2 + i + second.cue[0], first.cue[1] + 2 + i + second.cue[1]],
        },
      }
    }
  }
  return {
    kind: first.kind,
    topic: topicFor(first.kind, said, first.cue),
    count: countIn(said),
    cue: first.cue,
  }
}

/** The words stop mid-thought ("find papers on…", "quiz me on the"): the pause waits longer. */
export function sentenceHangs(text: string) {
  return /(?:\b(?:on|about|for|and|or|the|a|an|of|to|with|from|in|into|than|then|my|our|their|is|are|was|between|versus|vs)|,)\s*$/i.test(
    text.trim(),
  )
}

/** The kind's own words on the stage pill. */
export const KIND_LABEL: Record<VoiceKind, string> = {
  ask: "question",
  find: "find sources",
  quiz: "practice",
  note: "note",
  brief: "audio brief",
  space: "new space",
  catchup: "catch up",
  remember: "it'll remember",
  show: "show me",
  done: "that's all",
}
