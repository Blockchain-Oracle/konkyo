// The made-with pages (plan F61), after OurSpaces' vendor pages (src/pages/About.tsx, MIT): what
// each partner does in Konkyo, in steps you can follow into the code. Every claim here is read
// from the code each step names; `pnpm made-with:code` copies those functions for the page and
// fails if one is gone. Plain data only: scripts/made-with-code.ts imports this file under Node.
import type { SpaceColor } from "@konkyo/config"
import type { Vendor } from "@/components/landing/vendor-logo"

/** A function (or const, class, table) in the repo, found by name. */
export type CodeRef = { file: string; symbol: string }
export type Detail = { title: string; body: string; code: CodeRef }

export type Partner = {
  id: Vendor
  name: string
  color: SpaceColor
  /** What it is to Konkyo, in a few words. */
  role: string
  headline: [string, string]
  intro: string
  cta: { label: string; href: string; note: string }
  /** The caption under the hero's example. */
  example: string
  journeyTitle: string
  journey: Detail[]
  capabilities: Detail[]
  technical: Detail[]
  /** Its section in the docs' sponsor page. */
  docs: string
}

export const codeKey = (ref: CodeRef) => `${ref.file}#${ref.symbol}`

const ANSWER = "packages/agents/src/answer.ts"
const ZETARIS_CHECKS = "packages/zetaris/src/checks.ts"
const EVIDENCE = "packages/zetaris/src/evidence.ts"
const MEMORY = "packages/agents/src/memory.ts"
const ANALYST = "packages/agents/src/analyst.ts"
const SCOUT = "packages/agents/src/scout.ts"
const METADATA = "packages/ingest/src/metadata.ts"
const DIALOGUE = "packages/ingest/src/dialogue.ts"
const CONNECTORS = "packages/connectors/src/index.ts"

export const PARTNERS: Partner[] = [
  {
    id: "zetaris",
    name: "Zetaris",
    color: "teal",
    role: "the evidence store every quote is checked against",
    headline: ["Every quote.", "Found, or gone."],
    intro:
      "Zetaris reads each of your PDFs on its own. Before you see an answer, every quote in it is looked up in that reading, in one SQL statement. A sentence whose words aren't there doesn't reach you.",
    cta: {
      label: "ask three real papers",
      href: "/#ask",
      note: "A real space of open-access papers. Each answer's quotes are checked as you watch.",
    },
    example:
      "Live: these three quotes are checked in Zetaris against its own reading of Nishida and Walker (2007), in one statement, when you press the button.",
    journeyTitle: "Follow one quote.",
    journey: [
      {
        title: "The paper goes in twice.",
        body: "Konkyo reads your PDF into passages. Zetaris reads the same PDF itself, with its own PDF reader, and keeps that text. The file says Ready only after Zetaris answers for it.",
        code: { file: EVIDENCE, symbol: "publishPdfText" },
      },
      {
        title: "The Writer quotes a passage.",
        body: "Each sentence of an answer carries the exact words it rests on, and the passage they came from.",
        code: { file: ANSWER, symbol: "write" },
      },
      {
        title: "One statement checks them all.",
        body: "Every quote in the answer goes to Zetaris as one VALUES list, joined to its reading of each paper. A quote counts only if its words appear there, in order.",
        code: { file: ZETARIS_CHECKS, symbol: "checkQuotes" },
      },
      {
        title: "What fails never reaches you.",
        body: "A sentence whose quote isn't found goes back to the Writer with the reason, at most twice. Whatever still fails is dropped, and the receipt says so.",
        code: { file: ANSWER, symbol: "reviseSentences" },
      },
    ],
    capabilities: [
      {
        title: "Under every answer.",
        body: "The receipt says how many quotes were checked in Zetaris and how long it took, with the statement itself under Show SQL. Each citation says Found in Zetaris.",
        code: { file: "apps/web/components/chat/run-receipt.tsx", symbol: "RunReceipt" },
      },
      {
        title: "In practice, briefs and drafts.",
        body: "Practice answer keys, every line of an audio brief, Check my draft and each article before it's published go through the same check.",
        code: { file: "packages/agents/src/tutor.ts", symbol: "confirmInZetaris" },
      },
      {
        title: "Before the Writer starts.",
        body: "While the Writer drafts, Konkyo asks Zetaris which of the documents it found Zetaris holds. Passages from a file it can't answer for are dropped.",
        code: { file: ZETARIS_CHECKS, symbol: "presentDocuments" },
      },
      {
        title: "Watching for new papers.",
        body: "A topic watch is a Zetaris REST table over OpenAlex. One statement subtracts every paper you already have or were told about, so only new ones reach your Inbox.",
        code: { file: "packages/zetaris/src/watch.ts", symbol: "newWorks" },
      },
    ],
    technical: [
      {
        title: "Why a second reading",
        body: "Konkyo's passages come from its own extraction, so checking a quote against them would only prove the Writer copied well. Zetaris reads the PDF separately: a quote passes only if the paper itself says it. Recordings have no PDF, so their quotes are checked against the stored transcript.",
        code: { file: EVIDENCE, symbol: "confirmPublished" },
      },
      {
        title: "Letters and digits only",
        body: "Both sides are lowercased and kept to a–z, 0–9 and the full stop, so line breaks, spaces and punctuation don't matter. Measured on real quotes it matched 10 of 10, and still caught a planted 1.2 → 12.",
        code: { file: EVIDENCE, symbol: "evidenceKey" },
      },
      {
        title: "Page furniture removed",
        body: "Margin line numbers and running heads in a PDF reading broke 3 of 10 brief quotes on testing. Konkyo removes only what is provably furniture, which can make a match harder, never easier.",
        code: { file: EVIDENCE, symbol: "withoutPageFurniture" },
      },
      {
        title: "A deadline, then a cancel",
        body: "Each statement has its own deadline, 30 seconds for a check. Past it Konkyo cancels the job, because an abandoned query keeps the engine busy for everyone. A momentary failure gets one retry after 400 ms.",
        code: { file: "packages/zetaris/src/client.ts", symbol: "runWithRetry" },
      },
    ],
    docs: "sponsor-tech#zetaris-the-evidence-store-every-claim-is-checked-against",
  },
  {
    id: "meterless",
    name: "Meterless",
    color: "pink",
    role: "memory, the world model and long tasks",
    headline: ["Tell it once.", "It remembers."],
    intro:
      "Mark an answer wrong and say why: Meterless H-MEM keeps that correction, with where it came from, and the next answer reads it first. Its World Model keeps where each of your sources stands on each claim.",
    cta: {
      label: "step into the library",
      href: "/sign-in",
      note: "No account needed: walk in as a guest. Your memory is on the knows page.",
    },
    example:
      "The path one correction takes, in the app's own words: the memory H-MEM stores and the note the next answer's Planner and Writer read.",
    journeyTitle: "Follow one correction.",
    journey: [
      {
        title: "You mark an answer wrong.",
        body: "A 👎 with a reason, a cited passage that didn't fit, or a line you tell it on the knows page.",
        code: { file: "apps/web/lib/chats.ts", symbol: "rateMessage" },
      },
      {
        title: "H-MEM keeps it, with its source.",
        body: "The correction goes into your own H-MEM with its provenance: which answer, which chat, and how much to trust it (0.8 for a 👎, 0.9 for a line you wrote).",
        code: { file: MEMORY, symbol: "recordCorrection" },
      },
      {
        title: "The next answer reads it first.",
        body: "Before planning, H-MEM ranks your memories for the new question, and only those about the same thing are kept.",
        code: { file: MEMORY, symbol: "recallFor" },
      },
      {
        title: "The Planner and Writer follow it.",
        body: "The relevant corrections go into their instructions as guidance, never as evidence: a memory is never cited.",
        code: { file: ANSWER, symbol: "memoryBlock" },
      },
    ],
    capabilities: [
      {
        title: "What it knows, in one place.",
        body: "The knows page lists how you like answers, from H-MEM. Cross one out and it's forgotten; H-MEM keeps the deletion in its trust ledger.",
        code: { file: MEMORY, symbol: "forget" },
      },
      {
        title: "Where your sources stand.",
        body: "When an answer compares sources, the Analyst writes each source's stance on each claim into a World Model: agrees, disagrees or partly, with the quote it was read from.",
        code: { file: ANALYST, symbol: "recordInWorld" },
      },
      {
        title: "Spaces learn together.",
        body: "Each person has a World Model, and so does each shared space: it grows from everyone's asks in it, and its members see it on the space's knows page.",
        code: { file: ANALYST, symbol: "worldFor" },
      },
      {
        title: "Deep search in bounded steps.",
        body: "Markovian screens what deep search found eight abstracts at a time, carrying only the shortlist, so the context stays the same size however many papers come back.",
        code: { file: SCOUT, symbol: "screenSources" },
      },
    ],
    technical: [
      {
        title: "Why recall is re-ranked",
        body: "H-MEM's built-in embedder hashes words, so “memory” in two unrelated questions looks alike to it. Konkyo keeps H-MEM's ranking, then drops anything under 0.35 cosine on OpenAI embeddings: related questions measured 0.42–0.81, unrelated ones 0.18–0.23.",
        code: { file: MEMORY, symbol: "MIN_MEANING" },
      },
      {
        title: "Feedback adjusts trust",
        body: "A 👍 or 👎 on an answer reaches the memories that shaped it, through H-MEM's own feedback, so a correction that keeps helping gains weight.",
        code: { file: MEMORY, symbol: "rateRecalled" },
      },
      {
        title: "Read back, never made up",
        body: "The knows page reads claims from the rows the Analyst wrote, never from a model. The World Model refuses a write without provenance.",
        code: { file: ANALYST, symbol: "knowsOf" },
      },
      {
        title: "Vendored as published",
        body: "H-MEM, the World Model and Markovian live in packages/meterless, unchanged from upstream commit 0aa7417 (Apache-2.0), each with its own file storage.",
        code: { file: "packages/meterless/src/hmem/index.ts", symbol: "HMEM" },
      },
    ],
    docs: "sponsor-tech#meterless-memory-world-state-and-long-tasks",
  },
  {
    id: "openai",
    name: "OpenAI",
    color: "violet",
    role: "the models that plan, write, check and teach",
    headline: ["One model", "for each job."],
    intro:
      "Every agent in Konkyo runs on an OpenAI model picked by measurement: the cheapest one that met that job's bar, with a fallback for outages. Embeddings find the passages; moderation keeps shared spaces safe.",
    cta: {
      label: "ask three real papers",
      href: "/#ask",
      note: "The receipt under each answer names the models that made it.",
    },
    example:
      "Read from the app's own config: the model each agent uses, its fallback, and what it was measured to do.",
    journeyTitle: "Follow one answer.",
    journey: [
      {
        title: "The Planner turns it into searches.",
        body: "One to three searches written in the words your passages would use, with your corrections read first.",
        code: { file: ANSWER, symbol: "plan" },
      },
      {
        title: "Embeddings find the passages.",
        body: "text-embedding-3-small vectors and Postgres full-text search run together and are merged by rank, so meaning and exact words both count.",
        code: { file: "packages/agents/src/retrieve.ts", symbol: "searchLibrary" },
      },
      {
        title: "The Writer quotes.",
        body: "One finding per sentence, each with its quote, streamed as it writes.",
        code: { file: ANSWER, symbol: "write" },
      },
      {
        title: "The Verifier judges support.",
        body: "While Zetaris checks the words, a second model reads each claim beside its passages and says whether they back it.",
        code: { file: ANSWER, symbol: "verify" },
      },
    ],
    capabilities: [
      {
        title: "Measured, then picked.",
        body: "Each role's model came out of a cost benchmark: the Writer copied 9 of 9 quotes verbatim, the Verifier made no false rejections and caught 6 of 6 planted errors.",
        code: { file: "packages/config/src/index.ts", symbol: "MODELS" },
      },
      {
        title: "Practice with checked keys.",
        body: "The Tutor makes recall, fix-the-false-statement and find-the-evidence items from your passages; every answer key then goes to the Verifier and to Zetaris.",
        code: { file: "packages/agents/src/tutor.ts", symbol: "makeItems" },
      },
      {
        title: "Deep search, on the web too.",
        body: "When your library runs out, the Scout plans the search and runs OpenAI's web search beside OpenAlex.",
        code: { file: SCOUT, symbol: "searchWeb" },
      },
      {
        title: "Safe to share.",
        body: "Questions asked in a public space, and every article before it's published, go through omni-moderation-latest, in one batched call.",
        code: { file: "packages/agents/src/moderate.ts", symbol: "moderateAll" },
      },
    ],
    technical: [
      {
        title: "A fallback for every role",
        body: "A call that fails runs once more on the role's fallback model, and the switch is written to the run's trace. A stopped run, or an account out of credit, doesn't fall back.",
        code: { file: "packages/agents/src/models.ts", symbol: "withFallback" },
      },
      {
        title: "One limiter for every call",
        body: "Every model call shares one token bucket per server, set below the account's limits: 400 requests a minute, 24 in flight.",
        code: { file: "packages/agents/src/models.ts", symbol: "model" },
      },
      {
        title: "Only the failures are rewritten",
        body: "Sentences the Verifier rejected go back to the Writer with its reasons; every other sentence stays word for word.",
        code: { file: ANSWER, symbol: "reviseSentences" },
      },
      {
        title: "Embeddings, cached",
        body: "Search phrases are embedded once and kept, so asking again costs no embedding call.",
        code: { file: "packages/agents/src/retrieve.ts", symbol: "embedQueries" },
      },
    ],
    docs: "sponsor-tech#openai-the-models-that-plan-write-check-and-teach",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    color: "orange",
    role: "listening and speaking",
    headline: ["Your sources,", "out loud."],
    intro:
      "Konkyo turns a space into an audio brief: two ElevenLabs voices talk through its sources, and every fact they say is cited. Scribe transcribes your lectures and hears you when you talk to it.",
    cta: {
      label: "step into the library",
      href: "/sign-in",
      note: "Make a brief from any space: + add, then audio brief.",
    },
    example:
      "A real brief Konkyo made from four papers on caffeine: two voices from Text to Dialogue, each line timed by Scribe, each fact cited.",
    journeyTitle: "Follow one brief.",
    journey: [
      {
        title: "The Writer scripts two hosts.",
        body: "A short conversation about the space's sources, each fact with its quote, checked in Zetaris like any answer.",
        code: { file: "packages/agents/src/brief.ts", symbol: "writeBrief" },
      },
      {
        title: "Text to Dialogue speaks it.",
        body: "eleven_v3 turns the whole script into one recording, in two voices.",
        code: { file: DIALOGUE, symbol: "speakDialogue" },
      },
      {
        title: "Scribe times every line.",
        body: "The dialogue's own timings drift up to 1.8 s after 30 s, so Scribe listens to the finished audio and each line is timed from its words.",
        code: { file: DIALOGUE, symbol: "timeLines" },
      },
      {
        title: "The player follows along.",
        body: "The line being said lights up with its source; tap its citation and the passage opens.",
        code: { file: "apps/web/components/briefs/brief-view.tsx", symbol: "Player" },
      },
    ],
    capabilities: [
      {
        title: "Lectures become sources.",
        body: "Scribe v2 transcribes recordings with word timings and speakers. Passages break at a new speaker, a pause or 45 seconds, so a citation plays the recording from its first word.",
        code: { file: "packages/ingest/src/transcript.ts", symbol: "transcribe" },
      },
      {
        title: "Talk to it.",
        body: "The orb listens with Scribe v2 Realtime in your browser, primed with words from your library so titles and names come out right.",
        code: { file: "apps/web/lib/scribe.ts", symbol: "connectScribe" },
      },
      {
        title: "Answers, read aloud.",
        body: "Flash reads an answer in the voice you picked, with word timings for the highlight. A clip is made once and kept, so playing it again costs nothing.",
        code: { file: "apps/web/lib/voice-server.ts", symbol: "speak" },
      },
      {
        title: "Say it, in study.",
        body: "Practice you can answer out loud: Scribe hears you, and your answer is checked like a typed one.",
        code: { file: "apps/web/components/voice/say-it.tsx", symbol: "SayIt" },
      },
    ],
    technical: [
      {
        title: "Your key stays on the server",
        body: "The browser listens with a single-use Scribe token made for that session, never the API key.",
        code: { file: "apps/web/lib/voice-server.ts", symbol: "scribeToken" },
      },
      {
        title: "Words to passages",
        body: "Timed words are grouped into passages at a speaker change, a 2.5 s pause, or once a passage passes its length and reaches a sentence end.",
        code: { file: "packages/ingest/src/transcript.ts", symbol: "wordsToPassages" },
      },
      {
        title: "Two hosts, two voices",
        body: "Briefs use eleven_v3 at 128 kbps with two fixed voices; guests make one a day, accounts five.",
        code: { file: "packages/config/src/index.ts", symbol: "BRIEF" },
      },
      {
        title: "Daily caps",
        body: "Speaking uses Flash v2.5. Each person gets 80 voice sessions and 8,000 spoken characters a day (guests 12 and 1,500); a cached clip doesn't count.",
        code: { file: "packages/config/src/index.ts", symbol: "VOICE" },
      },
    ],
    docs: "sponsor-tech#elevenlabs-listening-and-speaking",
  },
  {
    id: "composio",
    name: "Composio",
    color: "cobalt",
    role: "Gmail, Google Drive and Notion",
    headline: ["Your inbox,", "in your library."],
    intro:
      "Connect Gmail, Google Drive or Notion through Composio, pick what to bring in, and it becomes a source like any upload: read, checked and cited. It stays up to date on its own.",
    cta: {
      label: "step into the library",
      href: "/sign-in",
      note: "Settings → Connectors, or + add → from Gmail, Drive or Notion.",
    },
    example:
      "What each connector brings in, and the Composio tools Konkyo calls for it, at the toolkit versions pinned in the app.",
    journeyTitle: "Follow one email.",
    journey: [
      {
        title: "You connect Gmail.",
        body: "Composio hosts the Google sign-in. The link lasts 10 minutes, and the account is only yours: your Konkyo id is your Composio user.",
        code: { file: CONNECTORS, symbol: "startConnection" },
      },
      {
        title: "You pick what to bring in.",
        body: "Konkyo lists your mail, Drive files or Notion pages through Composio's tools, 25 at a time, with search.",
        code: { file: "apps/web/lib/connections.ts", symbol: "browse" },
      },
      {
        title: "It becomes a source.",
        body: "An email becomes a page with its headers and attachments, a Drive file its own bytes (Google formats exported), a Notion page its Markdown. Then it's read like any upload.",
        code: { file: "apps/worker/src/connectors.ts", symbol: "materialize" },
      },
      {
        title: "It stays up to date.",
        body: "Every 15 minutes, Drive files and Notion pages that changed are read again, and a Gmail watch brings in new matches.",
        code: { file: "apps/worker/src/connectors.ts", symbol: "syncConnections" },
      },
    ],
    capabilities: [
      {
        title: "Settings → Connectors.",
        body: "Connect, see when each last synced, and disconnect, keeping or removing what it brought in.",
        code: { file: "apps/web/lib/connections.ts", symbol: "connect" },
      },
      {
        title: "From the add menu.",
        body: "+ add → from Gmail, Drive or Notion opens a picker; what you choose lands in your library, or straight into a space.",
        code: { file: "apps/web/lib/connections.ts", symbol: "importItems" },
      },
      {
        title: "A Gmail watch.",
        body: "Give Gmail a search, like a supervisor's address, and matching mail comes in by itself.",
        code: { file: "apps/web/lib/connections.ts", symbol: "setWatch" },
      },
      {
        title: "When access runs out.",
        body: "A revoked or expired account is recognised from the tool's error and marked once, with a Reconnect notice in your Inbox.",
        code: { file: CONNECTORS, symbol: "run" },
      },
    ],
    technical: [
      {
        title: "Pinned toolkit versions",
        body: "Gmail, Drive and Notion toolkits are pinned to the versions Konkyo was tested on, so a toolkit update can't change what a tool returns.",
        code: { file: CONNECTORS, symbol: "create" },
      },
      {
        title: "An email, in full",
        body: "Headers, plain text and attachments; the attachment list is read under both spellings Gmail's schema allows.",
        code: { file: CONNECTORS, symbol: "gmailMessage" },
      },
      {
        title: "Drive's own formats",
        body: "Google Docs, Sheets and Slides are exported; other files download as they are, up to 10 MB.",
        code: { file: CONNECTORS, symbol: "driveDownload" },
      },
      {
        title: "Notion as Markdown",
        body: "A Notion page comes in as its Markdown, so headings and lists survive into the passages.",
        code: { file: CONNECTORS, symbol: "notionPage" },
      },
    ],
    docs: "sponsor-tech#composio-gmail-google-drive-and-notion",
  },
  {
    id: "openalex",
    name: "OpenAlex",
    color: "butter",
    role: "open papers for deep search",
    headline: ["When your library", "runs out."],
    intro:
      "Deep search finds open-access papers in OpenAlex, screens them against your question, and with your OK brings them in and answers from them. Every upload is matched to its published record, too.",
    cta: {
      label: "step into the library",
      href: "/sign-in",
      note: "Ask with deep search on, or set a watch on a topic.",
    },
    example:
      "Live from OpenAlex: the same search deep search runs, open-access papers with a PDF copy only.",
    journeyTitle: "Follow one paper.",
    journey: [
      {
        title: "Deep search asks OpenAlex.",
        body: "Up to three searches, open-access papers with a PDF copy only: OpenAlex fetched 10 of 10 of those, where publisher links managed 2 of 20.",
        code: { file: METADATA, symbol: "searchWorks" },
      },
      {
        title: "The best are shortlisted.",
        body: "Abstracts are screened against your question in Markovian steps; at most eight sources reach you, best first.",
        code: { file: SCOUT, symbol: "findSources" },
      },
      {
        title: "You approve, it's brought in.",
        body: "The PDF comes from OpenAlex's own copy, and is checked to be a PDF, not a login page.",
        code: { file: METADATA, symbol: "openAlexPdf" },
      },
      {
        title: "It arrives with its citation.",
        body: "Authors, venue, year and cited-by, found by DOI, then arXiv id, then a title close enough to be the same paper.",
        code: { file: METADATA, symbol: "findMetadata" },
      },
    ],
    capabilities: [
      {
        title: "Every upload, identified.",
        body: "Each file you add is matched to its published record, and its details say how: by DOI, arXiv id or title.",
        code: { file: "apps/worker/src/pipeline.ts", symbol: "describe" },
      },
      {
        title: "Watches for new papers.",
        body: "Watch a topic and new open-access papers land in your Inbox, five at most each run.",
        code: { file: "apps/worker/src/agents.ts", symbol: "runWatch" },
      },
      {
        title: "Free copies, best first.",
        body: "For a DOI, arXiv first, then every open copy OpenAlex knows with a PDF link. No free copy means Konkyo says so instead of saving an abstract page.",
        code: { file: METADATA, symbol: "openAccessPdfs" },
      },
      {
        title: "Licences for articles.",
        body: "Before an article shows a paper's figure, OpenAlex says whether its licence is open.",
        code: { file: METADATA, symbol: "openAccessLicence" },
      },
    ],
    technical: [
      {
        title: "The key stays in a header",
        body: "The API key goes in a header, never the URL, because URLs end up in logs. Each call has an 8-second timeout.",
        code: { file: METADATA, symbol: "openAlex" },
      },
      {
        title: "Through Zetaris, or direct",
        body: "A watch reads OpenAlex through its Zetaris REST table; if that fails, the same search runs directly.",
        code: { file: "apps/worker/src/agents.ts", symbol: "directWorks" },
      },
      {
        title: "Newest, with a PDF",
        body: "A watch's search matches the topic in title and abstract, newest first, open access with a PDF copy, 25 at a time.",
        code: { file: "packages/zetaris/src/watch.ts", symbol: "watchEndpoint" },
      },
      {
        title: "Searches a day",
        body: "A deep search downloads papers at $0.01 each, so guests get 3 a day and accounts 20.",
        code: { file: "packages/config/src/index.ts", symbol: "LIMITS" },
      },
    ],
    docs: "sponsor-tech#openalex-open-papers",
  },
]

export const partnerOf = (id: string) => PARTNERS.find((p) => p.id === id)
