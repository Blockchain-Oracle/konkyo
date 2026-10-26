import { INGEST } from "@konkyo/config"
import { type FoundWork, searchWorks } from "@konkyo/ingest/metadata"
import { Markovian } from "@konkyo/meterless/markovian"
import { generateText, Output } from "ai"
import { z } from "zod"
import { MODELS, type ModelChoice, model, noFallback, reasoning } from "./models"
import type { Tracer } from "./trace"

/** A source deep search found: a paper OpenAlex holds a PDF of, or a Wikipedia article. */
export type FoundSource =
  | ({ key: string; kind: "paper" } & Omit<FoundWork, "id"> & { workId: string })
  | { key: string; kind: "web"; title: string; url: string; site: string; summary?: string }

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
  webQuery: z
    .string()
    .describe("One encyclopedia search: the topic's plain name in 1-4 words, as an article title"),
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
        "You plan a literature search for a question someone's own library couldn't answer. Write keyword queries an academic search engine matches (the terms papers use, not a question), one encyclopedia search (the topic's plain name, as a Wikipedia article would title it), and a short folder name for what will be found.",
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

/** Wikipedia's search API (free, no key): reputable explainers anyone can read and import. */
const WIKIPEDIA_SEARCH = "https://en.wikipedia.org/w/rest.php/v1/search/page"
const WIKIPEDIA_PAGE = "https://en.wikipedia.org/wiki/"
const WEB_PAGES = 4
const WEB_TIMEOUT_MS = 8_000

type WikipediaPage = { key: string; title: string; description?: string | null; excerpt?: string }

/** Encyclopedia articles for a query from Wikipedia's own search (plan F18), with their gist. */
async function searchWeb(query: string, tracer: Tracer, abortSignal?: AbortSignal) {
  const started = performance.now()
  const url = new URL(WIKIPEDIA_SEARCH)
  url.searchParams.set("q", query)
  url.searchParams.set("limit", String(WEB_PAGES))
  const timeout = AbortSignal.timeout(WEB_TIMEOUT_MS)
  const res = await fetch(url, {
    headers: { "user-agent": INGEST.userAgent, accept: "application/json" },
    signal: abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout,
  })
  if (!res.ok) throw new Error(`Wikipedia search failed (${res.status})`)
  const { pages } = (await res.json()) as { pages: WikipediaPage[] }
  const found = pages.map((page) => {
    const href = `${WIKIPEDIA_PAGE}${encodeURIComponent(page.key)}`
    // The excerpt marks the matched words with <span class="searchmatch">: plain text only.
    const excerpt = page.excerpt
      ?.replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
    return {
      key: `web:${href}`,
      kind: "web" as const,
      title: page.title,
      url: href,
      site: "en.wikipedia.org",
      summary: [page.description, excerpt].filter(Boolean).join(" · ") || undefined,
    }
  })
  tracer.log({
    agent: "scout",
    step: "web",
    action: "searched_wikipedia",
    toolCalls: ["wikipedia_search"],
    rowsReturned: found.length,
    latencyMs: Math.round(performance.now() - started),
    detail: { query },
  })
  return found
}

/**
 * Papers (OpenAlex, open access with a PDF copy) and Wikipedia articles, deduplicated and
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
    : `[${s.key}] WEB PAGE · ${s.title} (${s.site})${s.summary ? `\n${s.summary.slice(0, 300)}` : ""}`
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
