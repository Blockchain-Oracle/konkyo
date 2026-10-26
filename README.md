<p align="center">
  <a href="https://konkyo.xyz">
    <img src=".github/assets/banner.png" width="960" alt="Konkyo's landing page: Your sources. Your questions. Your grounds. A sample paper and its checked, cited answer appear on a purple space wall." />
  </a>
</p>

<h1 align="center">Konkyo · 根拠</h1>
<p align="center">Every answer shows its grounds.<br/>A research library whose agents answer from your sources and check every quote.</p>

<p align="center">
  <a href="https://konkyo.xyz"><b>Open Konkyo</b></a>
  &nbsp;·&nbsp;
  <a href="https://konkyo.xyz/demo"><b>Demo</b></a>
  &nbsp;·&nbsp;
  <a href="https://konkyo.xyz/pitch"><b>Pitch</b></a>
  &nbsp;·&nbsp;
  <a href="https://docs.konkyo.xyz"><b>Documentation</b></a>
  &nbsp;·&nbsp;
  <a href="https://konkyo.xyz/made-with/zetaris"><b>How quotes are checked</b></a>
</p>

Konkyo (根拠, "grounds" or "evidence") reads your papers, lecture recordings, slides and notes.
Ask it a question and a team of agents finds the passages, writes a cited answer, checks every
quote word for word in Zetaris, sends unsupported sentences back to be rewritten, and shows you
where your sources agree and where they don't. Every answer comes with its receipt: the passages,
the checks, and the SQL that ran them.

Ask three real papers on the [landing page](https://konkyo.xyz/#ask), or walk in as a guest and
bring your own sources. No account is needed for the sample question.

Open Agent Hackathon 2026, **Track 02: The Agent That Can Explain Why**:
*"Build agents that investigate complex questions across multiple data sources, connect findings,
and produce evidence-backed answers or recommendations."*

## Try it in one minute (no keys, no services)

```bash
corepack enable && pnpm install
pnpm konkyo ask --sample        # or: SAMPLE_MODE=true pnpm konkyo
```

Run these commands from a checkout of this repository.

No `.env`, keys, database or Docker are needed. Sample mode replays a run recorded against real
services: the replies OpenAI, Nemotron (on NVIDIA's API), Zetaris and the library search gave are
handed back, and every step of Konkyo's own logic runs again on them
(planning, citation parsing, the quote checks, the Verifier's verdicts and rewrites, the
agree/disagree matrix, the World Model, the trace). It prints the cited answer and the path of the
new trace in `logs/`. `pnpm konkyo samples` lists the five recorded questions; see
[examples/](examples/README.md) for their outputs and traces, and [data/](data/README.md) for the
sample sources, their licences and how they reach Zetaris. They were recorded while the OpenAI
account was out of credit, so they show the fallback path (Nemotron writes and checks; each switch
is in the trace).

```
$ pnpm konkyo ask --sample 2
Sample mode: replaying the replies OpenAI, Nemotron, Zetaris and the library search gave on 2026-10-21.
No keys and no services: every agent step below runs again on those replies.

What role do sleep spindles play in memory, and do these papers agree about it?
  ✓ Planning · What role do sleep spindles play in memory, and do these papers agree about it?
  ✓ Searching your library · 16 passages from 3 files
  ✓ Checking sources in Zetaris · 3 of 3 files confirmed
  ✓ Comparing sources · 3 claims across 3 sources
  ✓ Writing
  ↺ The Verifier sent back 1 sentence; rewriting (round 1)
  ✓ Verified 5 citations

Sleep spindles are associated with memory consolidation across studies [1]. The passages describe
spindles as a defining electrophysiological signature of NREM sleep that may represent candidate
triggers of synaptic potentiation leading to neural plasticity [1] and correlate with subsequent
memory performance [2]. …
…
Sources (5)
Each quote was found word for word in Zetaris's own reading of the source.

[2] Diekelmann · 2014, Sleep for cognitive enhancement, p. 5
    “the number and activity of sleep spindles correlates with subsequent memory performance
    (e.g., Clemens et al., 2005; Nishida and Walker, 2007)”
…
```

## Who it's for

Students and researchers who read a lot and have to cite what they read: a thesis student with
forty PDFs, a course's lecture recordings and slides, a reading group comparing papers. The
problem is trust. General chat assistants answer fluently from memory, mix up sources and invent
quotes; checking them takes as long as reading. Konkyo answers only from your library, says "Not
in your library" when it can't, and makes every cited claim checkable in one click: the citation opens
the source at the passage, highlighted.

## Demo video

<p align="center">
  <a href="https://konkyo.xyz/demo">
    <img src="apps/web/public/demo/cover.png" width="960" alt="Open the Konkyo demo page: a dated capture of the real landing page with a play symbol and a clear recording-coming-soon label." />
  </a>
</p>

The walkthrough recording is in progress. [Open the demo page](https://konkyo.xyz/demo) to try
the live three-paper question now; it links to the [recorded sample run](https://docs.konkyo.xyz/sample-mode)
and explains what to inspect in the answer. The cover is based on an actual landing-page capture
from 2026. It is an editorial cover, not a video frame or evidence that a new answer
was verified.

The [filming script](docs/demo/2026-10-22-konkyo-demo-script.md) follows a new guest from the
sample question through a highlighted citation, the receipt, Study, Write, sharing and the
underlying sponsor technology. It is a guide for recording, not a claim that the video is live.

## How an answer is made

```mermaid
flowchart LR
  Q[Question] --> M[H-MEM: your corrections]
  M --> P[Planner]
  P --> R[Retriever: pgvector + full text, fused]
  R -- best match weak --> P2[Planner replans: broader terms, the papers' own words]
  P2 --> R
  R --> Z1[Zetaris pre-check: are these documents in the evidence store?]
  R --> W[Writer: cited draft, streamed]
  R --> A[Analyst: claims × sources, when comparing]
  W --> V{Verifier}
  Z1 --> V
  V -- every quote in one Zetaris statement --> V
  V -- unsupported sentences, with reasons --> W2[Writer rewrites those sentences]
  W2 --> V
  V --> F[Answer: only what passed]
  A --> ZA[Zetaris checks the matrix quotes] --> WM[World Model: sources, claims, stances, provenance]
  F --> T[Receipt + trace in logs/]
```

| Agent | Does | Model |
|---|---|---|
| Planner | Rewrites the question to stand alone, plans 1–3 searches, flags comparisons, reads the person's corrections from H-MEM first; when the first search comes back thin, replans from what it found and searches again before saying "Not in your library"; if no Planner model answers, the question is searched as asked | Nemotron 3 Ultra |
| Retriever | Hybrid search: pgvector cosine and Postgres full text per query, fused by Reciprocal Rank Fusion; questions embedded as queries, passages as passages | Nemotron 3.5 Embed |
| Writer | One finding per sentence, each with a citation and an exact quote from its passage | OpenAI `gpt-6-luna` |
| Verifier | Checks each quote in code, then in **one Zetaris statement** against Zetaris's own reading of the PDF (a rewrite round checks only its new quotes; the quotes the answer keeps end up in one statement, the one its receipt shows); judges whether each sentence's quotes support it, and an uncited sentence passes only as a transition; a sentence it gives no verdict on fails; sends failures back with reasons (at most two rewrite rounds); anything that still fails is dropped, never shown as verified | OpenAI `gpt-6-luna` (low reasoning) |
| Analyst | When a question weighs several sources: 3–6 specific claims × sources with agrees / disagrees / partly, each stance quoted and checked in Zetaris, recorded in the World Model. Also places each paper a watch finds: agrees with, disagrees with, or new to your sources, your passage quoted | OpenAI `gpt-6-luna` (low) |
| Scout | Deep search: OpenAlex papers and web pages (OpenAI's web search, Wikipedia if it fails), screened in Markovian steps, imported and read before answering | Nemotron 3.5 Lightning plans, Nemotron 3 Ultra screens |
| Tutor | Practice items from your passages, every answer key checked by the Verifier and every quote in Zetaris | OpenAI `gpt-6-luna` |

OpenAI writes and judges; Nemotron plans, finds, screens and guards. Each role has a fallback on
the other provider (OpenAI's on Nemotron 3 Ultra, Nemotron's on `gpt-6-luna`) and a reserve on a
third model, tried in turn, the ones answering first, so an outage, an empty account or NVIDIA's
free tier filling up doesn't stop an answer while any of them can still answer; each switch is
logged. Public
questions, profiles and articles go through Nemotron 3.5 Content Safety first. The models were
picked by measured benchmarks: OpenAI's on testing, Nemotron's on NVIDIA's API on testing, where
Ultra with thinking off passed every test (0/10 false rejections, 6/6 planted errors caught, 9/9
quotes verbatim).

## Sponsor technology

Each partner has a page on konkyo.xyz that follows one action into the code, with an
example (live for Zetaris and OpenAlex): [Zetaris](https://konkyo.xyz/made-with/zetaris) (three quotes checked in one statement
as you watch), [Meterless](https://konkyo.xyz/made-with/meterless),
[NVIDIA Nemotron](https://konkyo.xyz/made-with/nvidia), [ElevenLabs](https://konkyo.xyz/made-with/elevenlabs)
(a real two-voice brief), [Composio](https://konkyo.xyz/made-with/composio) and
[OpenAlex](https://konkyo.xyz/made-with/openalex) (a live search). Their "follow it in the code"
excerpts are copied from this repository by `pnpm made-with:code`.

### Zetaris: the evidence store every claim is checked against

Konkyo's answers are only as good as the check, and the check is Zetaris. Remove it and nothing
can be marked verified.

- **Evidence store.** When a file is read, the worker publishes its passages as JSON to a Zetaris
  `FILESTORE` table (`konkyo.konkyo_passages`), hands Zetaris the PDF rendition, and keeps
  **Zetaris's own PDFBox reading** of it (`konkyo.konkyo_pdf_text`), a second extraction
  independent of Konkyo's. A file is marked Ready only after Zetaris answers for it.
  [`packages/zetaris/src/evidence.ts`](packages/zetaris/src/evidence.ts)
- **Pre-check.** Before the Writer's draft is checked, one statement confirms the retrieved
  documents are in the evidence store. [`checks.ts`](packages/zetaris/src/checks.ts)
- **Quote verification.** Every quote of an answer is checked in **one** Spark SQL statement: a
  `VALUES` list joined to Zetaris's PDF text (recordings: to the stored transcript passages), a
  quote counting only if its normalised words appear verbatim. The same check runs for the
  Analyst's matrix, study items, lecture notes and audio briefs. The statement is shown in the
  app's receipt ("Show SQL") and in [examples/](examples/02-agree-disagree/output.md).
- **Agents that watch a topic.** A watch is a Zetaris Lightning `REST` table over OpenAlex; each
  run refreshes it and finds new papers with one `LEFT ANTI JOIN` against the DOIs already seen.
  [`watch.ts`](packages/zetaris/src/watch.ts)
- Every Zetaris call is in the trace as `queried_zetaris` with the statement's hash and rows.

### NVIDIA Nemotron: planning, search, safety, and every fallback

Nemotron runs on NVIDIA's API through [`packages/models`](packages/models/src/index.ts), the one
place Konkyo calls any model.

- **Nemotron 3.5 Embed** embeds every passage (as a passage) and every question (as a query) for
  pgvector search, at 1536 of its 2048 dimensions: every answer starts with it.
- **Nemotron 3 Ultra** (550B, 55B active) plans each answer (OpenAI stands in while it's busy) and
  screens deep-search finds in
  Markovian steps, and stands in for the Writer, Verifier, Analyst, Tutor and Grader whenever
  OpenAI is down or out: with its thinking off it passed every test in our benchmark on NVIDIA's
  API (0/10 false rejections, 6/6 planted errors caught, 9/9 quotes verbatim).
- **Nemotron 3.5 Lightning** (30B, 3B active) plans deep searches, reads a spoken ask while you're
  still talking, and summarises each file as it's read.
- **Nemotron 3.5 Content Safety** checks questions in public spaces, public profiles and every
  article before it's published.
- Run inside the free tier: a rate limit per model in each process (the web app and the worker
  take shares that add up to NVIDIA's ~40 a minute); a stalled call is asked again (a hedged
  request) and the first answer wins; a model that answers 429 goes second for a minute; every
  call has a deadline, a fallback on the other provider and a reserve, logged as
  `escalated_to_fallback`. [`provider.ts`](packages/models/src/provider.ts)

### Meterless: memory, world state and long-task reasoning

The three engines are vendored unchanged (Apache-2.0) in [`packages/meterless`](packages/meterless/NOTICE)
and driven from [`packages/agents`](packages/agents/src).

- **H-MEM** ([`memory.ts`](packages/agents/src/memory.ts)): a 👎 with a reason, "wrong passage",
  or "this item is wrong" becomes a correction in the person's memory, with provenance. The
  Planner reads relevant corrections before every answer (H-MEM's hybrid ranking, then an
  embedding gate); 👍/👎 on an answer adjusts the confidence of the memories it used. The knows
  page shows them; cross one out and it's forgotten.
- **World Model** ([`analyst.ts`](packages/agents/src/analyst.ts)): the Analyst records each
  comparison as sources, claims and `supports` / `contradicts` / `qualifies` relations, each with
  the passage it was read from, in one event-sourced model per person.
- **Markovian** ([`scout.ts`](packages/agents/src/scout.ts)): deep search screens what it found
  in bounded RESEARCH steps that carry only the shortlist forward; Markovian's own estimate of the
  tokens saved is shown on the approval card and logged.

## AI and model usage

- **Models and providers:** OpenAI (`gpt-6-luna` for the Writer, Verifier, Analyst, Tutor and
  Grader; `gpt-5-nano` running OpenAI's web search for deep search) and NVIDIA Nemotron on
  NVIDIA's API, free tier (3 Ultra, 3.5 Lightning, 3.5 Embed 1B and 3.5 Content Safety, as above,
  and 3.5 Super VL as a reserve for the Writer, Analyst and Tutor).
  ElevenLabs for
  speech (Scribe `scribe_v2` and realtime for transcription; Flash v2.5 and Eleven v3 dialogue for
  read-aloud and audio briefs). No other AI model is called while Konkyo runs.
- **Made once, shipped as files:** the illustrations (the looks, stickers and landing pictures)
  were generated with OpenAI's image models (gpt-image-2; stickers gpt-image-1) by
  [`scripts/make-images.mjs`](scripts/make-images.mjs), and the five study sounds with
  ElevenLabs' sound-effects model.
- **Frameworks:** the AI SDK 7 (`ai`, `@ai-sdk/openai`, and `@ai-sdk/openai-compatible` pointed at
  NVIDIA's API),
  Next.js 16, Postgres with pgvector, pg-boss, Better Auth; Zetaris and Meterless as above.
- **Data:** your own uploads; OpenAlex, the web and Wikipedia for deep search and paper records; the
  sample library is openly licensed papers (see [examples/](examples/README.md)).
- **Development:** written with Claude Code (Anthropic). Cursor was not used.

## Everything else it does

- **Spaces:** each subject or project is a space with its own colour and wall: its sources,
  pinned answers, notes, practice and audio brief in one place, made from a template (exam prep,
  essay, literature review, reading group). Share one with an invite link or by email; members
  are there live (who's here, sources landing as they're added, a space chat that can ask
  @konkyo), pin answers to the wall and leave takes on sources. Each space has its own email
  address: forward it a paper and it lands on the wall (mail from outside the space waits for the
  owner's yes).
- **Library:** PDF, Word, PowerPoint, Markdown, text, web pages, YouTube, audio and video
  (transcribed with ElevenLabs Scribe, cited to the second). ⌘K, Trash, DOI import. Every
  document gets a PDF rendition, so one viewer highlights any citation.
- **Ask:** from the dock, over the whole library, a space or chosen files; the agree/disagree
  matrix; the receipt with steps, sources, memories and SQL; "Not in your library" with Find
  sources. **Catch me up** says what moved since your last visit.
- **Voice:** talk to the orb (ElevenLabs Scribe Realtime); it answers on a card built while you
  speak and says the short answer out loud.
- **Deep search:** finds papers (OpenAlex, open access) and web pages, imports them, answers.
- **Write:** notes with citation chips, "Find a source" for a sentence, "Check my draft"
  (supported / partly / contradicted / not found), versions with a diff, export to Word in any
  CSL style or to Google Docs, and **publish** as a public article whose every claim was checked
  before it went out.
- **Study:** quizzes and games from your sources with checked answer keys, hints that never give
  the answer away, spaced repetition (FSRS) and streaks. **Live rounds:** play a quiz together in
  a shared space with a join code; answers turn face up together with the passage.
- **What it knows:** your corrections (H-MEM) and where your sources stand on each claim (World
  Model), yours and each space's, readable and editable.
- **Agents:** saved standing tasks: watch a topic for new papers, or quiz a folder on a schedule.
- **Public spaces:** a read-only link anyone can read and ask, with moderation and caps.
- **Audio brief:** two voices talk through a space (ElevenLabs), every line cited and checked.
- **Connectors:** Gmail, Google Drive and Notion through Composio; imports resync when they
  change.
- **People:** profiles with handles, follows, and a guest entry that needs no account: keep it
  later with Google or a code by email.
- **Email** (Resend): sign-in codes, mail to a space, invites, and an opt-in weekly digest.

## Entry points

| | |
|---|---|
| Web app | `pnpm dev` → http://localhost:3210 (sign in with Google or as a guest) |
| CLI | `pnpm konkyo ask "<question>" [--folder <name>] [--compare] [--json]` (see `pnpm konkyo help`) |
| Sample mode | `pnpm konkyo ask --sample [n]`, no keys or services |
| HTTP | `POST /api/v1/ask` with a key from Settings → API keys |

```bash
curl -X POST http://localhost:3210/api/v1/ask \
  -H "Authorization: Bearer $KONKYO_API_KEY" -H "content-type: application/json" \
  -d '{"question": "How does sleep help memory?"}'
```

It returns the answer, citations, matrix, receipt and the full trace as JSON; with
`Accept: application/x-ndjson`, every agent step streams as a line. The question lands in Chats
like any other.

## Run it yourself

Needs Node 22.18+, pnpm (via `corepack enable`), Docker, a Zetaris instance, an OpenAI API key and
an NVIDIA API key (free at [build.nvidia.com](https://build.nvidia.com/settings/api-keys)).

```bash
cp .env.example .env            # fill it in; every variable is described there
pnpm install
pnpm services:up                # Postgres + pgvector, RustFS (S3), Gotenberg
pnpm services:check
pnpm db:migrate
pnpm dev                        # web app on :3210, the worker, docs on :3211
```

**Zetaris:** the hackathon's instance (set `ZETARIS_REST_URL` and `ZETARIS_API_KEY`), or the local
bundle (`ZETARIS_LOGIN_URL`, `ZETARIS_USERNAME`, `ZETARIS_PASSWORD`, `ZETARIS_ORG_ID`).
`EVIDENCE_DIR` is where the worker writes evidence files and `ZETARIS_EVIDENCE_URI` is the same
folder as Zetaris sees it. **ElevenLabs** is needed for recordings and audio briefs; **Google
OAuth** for sign-in; **Composio** and **VAPID** keys are optional.

**All in Docker** (what production runs): `infra/compose.prod.yaml` builds the web app, the
worker (with OCRmyPDF and yt-dlp) and the docs from their Dockerfiles, and runs them with
Postgres, RustFS and Gotenberg. Migrations run first; web and worker share one `/data` volume
(traces, memory, World Model). Zetaris stays outside (set `ZETARIS_*`).

```bash
docker compose -f infra/compose.prod.yaml up -d --build
```

A sample library for the CLI: `pnpm konkyo seed --user you@example.com`, then
`pnpm konkyo ask "Does a nap help motor learning?" --user you@example.com --folder "Essay starter: Sleep and learning"`.

## Repository

```
apps/web          Next.js 16 app: UI, API routes, the chat's answer stream, /api/v1/ask
apps/worker       pg-boss worker: ingest pipeline, deep search, study sets, agents, briefs, sync
apps/cli          pnpm konkyo: ask, samples, seed
apps/docs         the docs site (Fumadocs, static export)
packages/agents   Planner, Retriever, Writer, Verifier, Analyst, Scout, Tutor; models; tracer
packages/zetaris  Zetaris REST client, evidence store, quote checks, watch tables
packages/meterless  H-MEM, World Model, Markovian (vendored, Apache-2.0)
packages/tape     record and replay for sample mode
packages/ingest   conversion (Gotenberg), PDF text and boxes, OCR, transcription, web capture
packages/db       Drizzle schema and migrations (Postgres + pgvector)
packages/…        config, env, jobs, storage, notify, connectors, study (FSRS), ui
examples/         five recorded runs: input, output, trace, tape
data/             the sample sources: links, licences, sizes, how they reach Zetaris
logs/             one JSONL trace per run
```

## Traces

Every run writes `logs/<runId>.jsonl`: which agent did what, with which model, against which
Zetaris statement (by hash), rows returned, verdicts (`approved`, `rejected_to_writer`,
`escalated_to_fallback`), latency and tokens. The app shows the same run as the receipt.

## Limits

- **Two model providers, a fallback and a reserve for each role.** OpenAI writes and judges; when
  it's down or out of credit, Nemotron takes over, slower on NVIDIA's free tier (about 40 requests
  a minute for each model, split between the web app and the worker). If every model of a role is
  busy, the answer says so and asks you to try again. Sample mode needs no key.
- **Live use needs Zetaris.** Nothing is marked verified without it, by design.
- **Sample mode replays recorded questions only.** Any other question is refused, not invented.
- **Fair-use caps** (no paywall): 300 answers, 20 deep searches and 300 files a day per account;
  guests get less (60, 3, 40). Settings → Usage shows them.
- **Connectors** use Composio-managed Google auth, whose consent screen asks for wider Gmail
  scopes than Konkyo uses (it only reads). A read-only auth config needs your own Google OAuth
  client.
- Scanned PDFs are read with OCRmyPDF (installed, or its Docker image); handwriting and complex
  tables can come out imperfect.


## Licences and credits

- **OurSpaces** ([thomasnguyen/ourspaces-app](https://github.com/thomasnguyen/ourspaces-app), MIT,
  © 2026 Thomas Nguyen): Konkyo's look is ported from it: the design system's tokens and walls,
  the landing and made-with pages (its About and vendor pages), the voice stage's choreography,
  and the voice orb's WebGL shader ([`orb-shader.ts`](apps/web/lib/orb-shader.ts)).
- **Interface sounds** (tap, place, check, promote) are from [Mixkit](https://mixkit.co/free-sound-effects/)
  under the [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree), trimmed as
  OurSpaces' sound notes describe. The five study sounds were made once with ElevenLabs' sound
  effects model ([`make-sounds.ts`](packages/ingest/scripts/make-sounds.ts)).
- **Fonts:** Bricolage Grotesque and IBM Plex (SIL Open Font License).
- **Code highlighting** on the made-with pages: [Shiki](https://shiki.style) (MIT), run at build.
- The Meterless engines are Apache-2.0 ([NOTICE](packages/meterless/NOTICE)). The sample sources
  are openly licensed (CC BY and CC BY-NC-SA); see [examples/](examples/README.md#sources-and-licences).
