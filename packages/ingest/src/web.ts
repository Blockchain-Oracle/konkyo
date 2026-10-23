import { INGEST } from "@konkyo/config"
import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import { documentHtml, escapeHtml, htmlToPdf } from "./convert"

export class UnreachableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnreachableError"
  }
}

export type FetchedSource = {
  bytes: Uint8Array
  contentType: string
  finalUrl: string
}

/** Downloads a URL with our bot identity and a deadline; blocked or failed fetches are "Couldn't reach". */
export async function fetchSource(url: string): Promise<FetchedSource> {
  let res: Response
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": INGEST.userAgent,
        accept: "text/html,application/pdf;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(INGEST.fetchTimeoutMs),
    })
  } catch (error) {
    throw new UnreachableError(networkProblem(new URL(url).hostname, error))
  }
  if (!res.ok) throw new UnreachableError(httpProblem(new URL(url).hostname, res.status))
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "",
    finalUrl: res.url || url,
  }
}

export type Article = {
  title: string
  byline?: string
  site?: string
  published?: string
  pdf: Uint8Array
}

/** Web page → readable article (Mozilla Readability) → our clean HTML → PDF that keeps the URL. */
export async function articleToPdf(
  html: string,
  url: string,
  options: { footer?: string } = {},
): Promise<Article> {
  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()
  if (!article?.content || (article.textContent ?? "").trim().length < 200) {
    throw new UnreachableError("This page has no readable article text")
  }
  const title = article.title?.trim() || new URL(url).hostname
  const meta = [article.byline, article.publishedTime?.slice(0, 10)].filter(Boolean).join(" · ")
  const body = `<h1>${escapeHtml(title)}</h1>${meta ? `<p class="source">${escapeHtml(meta)}</p>` : ""}${article.content}`
  const pdf = await htmlToPdf(
    documentHtml(title, body, { url, site: article.siteName ?? undefined }),
    options,
  )
  return {
    title,
    byline: article.byline ?? undefined,
    site: article.siteName ?? undefined,
    published: article.publishedTime ?? undefined,
    pdf,
  }
}

/** Plain words for why a link couldn't be fetched (shown on the file's row). */
function networkProblem(host: string, error: unknown): string {
  const err = error as Error & { cause?: { code?: string } }
  if (err.name === "TimeoutError") return `${host} took too long to answer. Try again later.`
  if (err.cause?.code === "ENOTFOUND") return `${host} doesn't exist. Check the link.`
  return `Couldn't connect to ${host}. Check the link, or try again later.`
}

function httpProblem(host: string, status: number): string {
  if (status === 404 || status === 410) return `${host} says this page doesn't exist (${status}).`
  if (status === 401 || status === 403)
    return `${host} only shows this page after signing in (${status}). Upload it as a PDF instead.`
  if (status === 429) return `${host} is limiting requests. Try again in a few minutes.`
  if (status >= 500) return `${host} is having trouble (${status}). Try again later.`
  return `${host} answered with an error (${status}).`
}
