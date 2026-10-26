import { BOT_CHECK } from "@konkyo/config"
import { type FoundWork, searchWorks } from "@konkyo/ingest/metadata"
import { Markovian } from "@konkyo/meterless/markovian"
import { generateText, Output } from "ai"
import { z } from "zod"
import { MODELS, type ModelChoice, model, noFallback, openai, reasoning } from "./models"
import type { Tracer } from "./trace"

/** A source deep search found: a paper OpenAlex holds a PDF of, or a page from web search. */
export type FoundSource =
  | ({ key: string; kind: "paper" } & Omit<FoundWork, "id"> & { workId: string })
  | { key: string; kind: "web"; title: string; url: string; site: string }

export type Shortlisted = FoundSource & { why: string; score: number }

/** What the screening cost, from Markovian's own accounting (chars/4, labelled "estimated"). */
export type ScreeningReport = {
  steps: number
  screened: number
  tokensUsed: number
  tokensSaved: number
  efficiencyPercent: number
  label: "estimated" | "measured"
}

async function withFallback<T>(
  role: "scout" | "screener",
  tracer: Tracer,
  step: string,
  call: (choice: ModelChoice) => Promise<T>,
): Promise<{ result: T; choice: ModelChoice }> {
  const { primary, fallback } = MODELS[role]
  try {
    return { result: await call(primary), choice: primary }
  } catch (error) {
    if (noFallback(error)) throw error
    tracer.log({
      agent: "scout",
      step,
      action: "escalated_to_fallback",
      model: fallback.id,
      detail: { reason: (error as Error).message.slice(0, 300), from: primary.id },
    })
    return { result: await call(fallback), choice: fallback }
  }
}

// ------------------------------------------------------------------ plan

const SearchPlan = z.object({
  topic: z.string().describe("A folder name for what's found: 2-5 plain words, no punctuation"),
  paperQueries: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("1-3 keyword queries for an academic search engine: the terms papers use"),
  webQuery: z.string().describe("One web search query for explainers, reviews or reports"),
})

export type SearchPlan = z.infer<typeof SearchPlan>

export async function planSearch(question: string, tracer: Tracer, abortSignal?: AbortSignal) {
  const started = performance.now()
  const { result, choice } = await withFallback("scout", tracer, "plan", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: SearchPlan }),
      instructions:
        "You plan a literature search for a question someone's own library couldn't answer. Write keyword queries an academic search engine matches (the terms papers use, not a question), one web query, and a short folder name for what will be found.",
      prompt: `Question: ${question}`,
      abortSignal,
    }),
  )
  tracer.log({
    agent: "scout",
    step: "plan",
    action: "planned_search",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    detail: result.output,
  })
  return result.output
}

// ------------------------------------------------------------------ find

/** Sites whose pages block servers or sit behind paywalls: their papers come through OpenAlex. */
const BLOCKED = [
  "youtube.com",
  "tiktok.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
  "researchgate.net",
  "doi.org",
  "academia.edu",
  "sciencedirect.com",
  "cell.com",
  "nature.com",
  "link.springer.com",
  "onlinelibrary.wiley.com",
  "tandfonline.com",
  "jstor.org",
]

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
}

const BLOCKED_PAGE = Symbol("blocked")

/**
 * A page's <title> (first 64 KB, 4 s at most), without the " | Site name" tail. `blocked` when
 * the site answered with a bot check instead: Konkyo couldn't read that page either.
 */
async function pageTitle(url: string): Promise<string | null | typeof BLOCKED_PAGE> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "KonkyoBot/1.0 (+https://konkyo.xyz)", accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok || !res.headers.get("content-type")?.includes("html") || !res.body) return null
    const reader = res.body.getReader()
    let html = ""
    while (html.length < 65_536) {
      const { value, done } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      if (/<\/title>/i.test(html)) break
    }
    void reader.cancel()
    const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    if (!raw) return null
    if (BOT_CHECK.test(raw)) return BLOCKED_PAGE
    const title = raw
      .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
      .replace(/\s+/g, " ")
      .split(/\s[|–—-]\s/)[0]
      ?.trim()
    return title && title.length > 3 ? title.slice(0, 200) : null
  } catch {
    return null
  }
}

/** Web pages for a query from OpenAI's built-in web_search tool (plan F18). */
async function searchWeb(query: string, tracer: Tracer, abortSignal?: AbortSignal) {
  const started = performance.now()
  const { result, choice } = await withFallback("scout", tracer, "web", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      tools: {
        web_search: openai.tools.webSearch({
          searchContextSize: "low",
          filters: { blockedDomains: BLOCKED },
        }),
      },
      toolChoice: { type: "tool", toolName: "web_search" },
      instructions:
        "Find up to 4 reputable pages that are free to read: reviews, university or institute explainers, encyclopedia articles, reputable science journalism. Then name them in one line each.",
      prompt: query,
      abortSignal,
    }),
  )
  const seen = new Set<string>()
  const pages = result.sources.flatMap((s) => {
    if (s.sourceType !== "url") return []
    const url = new URL(s.url)
    url.searchParams.delete("utm_source")
    const key = url.href
    if (seen.has(key) || /\.pdf$/i.test(url.pathname)) return []
    seen.add(key)
    const site = url.hostname.replace(/^www\./, "")
    return [{ key: `web:${key}`, kind: "web" as const, title: s.title || site, url: key, site }]
  })
  // web_search gives addresses without titles: read each page's own <title>, quickly. A page
  // that answers with a bot check is dropped: it couldn't be imported either.
  const blocked = new Set<string>()
  await Promise.all(
    pages.slice(0, 4).map(async (page) => {
      if (page.title !== page.site && !BOT_CHECK.test(page.title)) return
      const title = await pageTitle(page.url)
      if (title === BLOCKED_PAGE || BOT_CHECK.test(page.title)) blocked.add(page.key)
      else if (title) page.title = title
    }),
  )
  const readable = pages.filter((page) => !blocked.has(page.key))
  tracer.log({
    agent: "scout",
    step: "web",
    action: "web_search",
    model: choice.id,
    toolCalls: ["web_search"],
    rowsReturned: readable.length,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    detail: { query, botChecks: blocked.size },
  })
  return readable.slice(0, 4)
}

/**
 * Papers (OpenAlex, open access with a PDF copy) and web pages (web_search), deduplicated and
 * without what's already in the library. Each one is reported as it's found.
 */
export async function findSources(
  plan: SearchPlan,
  input: {
    tracer: Tracer
    /** DOIs already in the library, lower case. */
    known: Set<string>
    onFound: (source: FoundSource) => void
    abortSignal?: AbortSignal
  },
): Promise<FoundSource[]> {
  const found = new Map<string, FoundSource>()
  const add = (source: FoundSource) => {
    if (found.has(source.key)) return
    found.set(source.key, source)
    input.onFound(source)
  }
  await Promise.all([
    ...plan.paperQueries.map(async (query) => {
      const started = performance.now()
      const works = await searchWorks(query, 12).catch((error: Error) => {
        input.tracer.log({
          agent: "scout",
          step: "openalex",
          action: "failed",
          detail: { query, message: error.message },
        })
        return []
      })
      input.tracer.log({
        agent: "scout",
        step: "openalex",
        action: "searched_openalex",
        rowsReturned: works.length,
        latencyMs: Math.round(performance.now() - started),
        detail: { query },
      })
      for (const { id, ...work } of works) {
        if (work.doi && input.known.has(work.doi.toLowerCase())) continue
        add({ key: `openalex:${id}`, kind: "paper", workId: id, ...work })
      }
    }),
    searchWeb(plan.webQuery, input.tracer, input.abortSignal)
      .then((pages) => {
        for (const page of pages) add(page)
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") throw error
        input.tracer.log({
          agent: "scout",
          step: "web",
          action: "failed",
          detail: { message: error.message.slice(0, 300) },
        })
      }),
  ])
  return [...found.values()]
}

// ------------------------------------------------------------------ screen

const Screened = z.object({
  keep: z.array(
    z.object({
      key: z.string(),
      score: z.number().int().min(1).max(5).describe("5 = answers the question directly"),
      why: z.string().describe("Why it helps answer the question, at most 14 words"),
    }),
  ),
})

const BATCH = 8
const SHORTLIST = 8

function describeSource(s: FoundSource) {
  return s.kind === "paper"
    ? `[${s.key}] PAPER · ${s.title} (${[s.authors[0], s.year, s.venue].filter(Boolean).join(", ")}; cited ${s.cited}×)\n${s.abstract.slice(0, 700) || "(no abstract)"}`
    : `[${s.key}] WEB PAGE · ${s.title} (${s.site})`
}

/**
 * Screens what was found against the question in Markovian RESEARCH steps (plan §2): each step
 * reads one batch of abstracts plus the shortlist so far (the carryover), never the whole pile,
 * so the context stays the same size however many sources come back. Returns at most 8 sources,
 * at most 2 of them web pages, best first, and Markovian's own estimate of the tokens saved.
 */
export async function screenSources(
  question: string,
  sources: FoundSource[],
  input: {
    tracer: Tracer
    onStep: (step: { step: number; of: number; kept: number }) => void
    abortSignal?: AbortSignal
  },
): Promise<{ shortlist: Shortlisted[]; report: ScreeningReport }> {
  const batches: FoundSource[][] = []
  for (let i = 0; i < sources.length; i += BATCH) batches.push(sources.slice(i, i + BATCH))
  const byKey = new Map(sources.map((s) => [s.key, s]))
  let shortlist: { key: string; score: number; why: string }[] = []
  const markovian = new Markovian({
    // One step reads a batch of 8 abstracts (~1,500 tokens) plus framing, the shortlist and its
    // output; Markovian requires chunkSize >= framing 400 + carryover + output budget 1,200.
    chunkConfig: {
      chunkSize: 3000,
      maxChunks: Math.min(32, Math.max(1, batches.length)),
      carryoverTokens: 512,
    },
  })

  const run = await markovian.run({
    mode: "RESEARCH",
    goal: `Find the sources that best answer: ${question}`,
    reflect: false,
    abortSignal: input.abortSignal,
    stepFn: async ({ step }) => {
      const batch = batches[step] ?? []
      const started = performance.now()
      const { result, choice } = await withFallback("screener", input.tracer, "screen", (c) =>
        generateText({
          model: model(c),
          providerOptions: reasoning(c),
          output: Output.object({ schema: Screened }),
          instructions:
            "You screen sources for a research question. Keep a source only if it would help answer the question (directly, or as needed background), judging from its title and abstract. Return the keys you keep with a score and a short reason. Keep the shortlist's earlier picks unless a new source is clearly better.",
          prompt: `Question: ${question}\n\nShortlist so far:\n${
            shortlist.length
              ? shortlist.map((k) => `[${k.key}] score ${k.score}: ${k.why}`).join("\n")
              : "(empty)"
          }\n\nNew sources:\n${batch.map(describeSource).join("\n\n")}`,
          abortSignal: input.abortSignal,
        }),
      )
      const merged = new Map(shortlist.map((k) => [k.key, k]))
      for (const k of result.output.keep) if (byKey.has(k.key)) merged.set(k.key, k)
      const ranked = [...merged.values()].sort((a, b) => b.score - a.score)
      // At most two web pages: papers carry the evidence, pages the context.
      let web = 0
      shortlist = ranked
        .filter((k) => (byKey.get(k.key)?.kind === "web" ? ++web <= 2 : true))
        .slice(0, SHORTLIST)
      input.tracer.log({
        agent: "scout",
        step: "screen",
        action: "screened_batch",
        model: choice.id,
        rowsReturned: result.output.keep.length,
        latencyMs: Math.round(performance.now() - started),
        tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
        detail: { step: step + 1, of: batches.length, batch: batch.length },
      })
      input.onStep({ step: step + 1, of: batches.length, kept: shortlist.length })
      const last = step + 1 >= batches.length
      // A step's content is what it read (the batch), so Markovian's accounting compares one
      // growing context holding every batch with steps that carry only the shortlist. The
      // carryover is that shortlist, on one line (Markovian reads it up to a blank line).
      return {
        content: `${batch.map(describeSource).join("\n")}\nScreened ${batch.length}; the shortlist holds ${shortlist.length}.\n[STATE_CHECKPOINT] ${JSON.stringify(shortlist.map((k) => [k.key, k.score]))}${last ? "\n[TASK_COMPLETE]" : ""}`,
      }
    },
  })

  const report: ScreeningReport = {
    steps: run.chunks.length,
    screened: sources.length,
    tokensUsed: run.totalTokensUsed,
    tokensSaved: run.totalTokensSaved,
    efficiencyPercent: run.efficiencyPercent,
    label: run.tokenLabel,
  }
  input.tracer.log({
    agent: "scout",
    step: "screen",
    action: "markovian_run",
    rowsReturned: shortlist.length,
    detail: { ...report, status: run.status },
  })
  return {
    shortlist: shortlist.flatMap((k) => {
      const source = byKey.get(k.key)
      return source ? [{ ...source, why: k.why, score: k.score }] : []
    }),
    report,
  }
}
