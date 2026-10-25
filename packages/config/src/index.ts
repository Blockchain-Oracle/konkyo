export * from "./meta"
export * from "./starters"
/**
 * Every product constant lives here: limits, timeouts, sizes, ports and names.
 * Code elsewhere imports these instead of writing numbers inline.
 */

export const APP = {
  name: "Konkyo",
  tagline: "Every answer shows its grounds.",
  /** The public repository, once it exists (S11); links to it are hidden until then. */
  repository: null as string | null,
  /** The live app and its docs site (apps/docs). */
  url: "https://konkyo.xyz",
  docs: "https://docs.konkyo.xyz" as string | null,
} as const

/** Local development ports, chosen to avoid the Zetaris bundle (3001, 8888) and other projects. */
export const LOCAL_PORTS = {
  web: 3210,
  docs: 3211,
  postgres: 54320,
  minioApi: 9200,
  minioConsole: 9201,
  gotenberg: 3220,
} as const

export const STORAGE = {
  /** One bucket; object keys are namespaced by purpose. */
  bucket: "konkyo",
  prefixes: {
    originals: "originals",
    renditions: "renditions",
    pages: "pages",
    audio: "audio",
    briefs: "briefs",
    exports: "exports",
    avatars: "avatars",
    articles: "articles",
  },
  /** Presigned upload URLs expire quickly; uploads start right after signing. */
  presignExpirySeconds: 15 * 60,
  /** Uppy multipart part size (S3 minimum is 5 MiB). */
  multipartPartBytes: 8 * 1024 * 1024,
  maxUploadBytes: 2 * 1024 * 1024 * 1024,
} as const

export const DB = {
  /** Connections per process (web and worker each hold one pool). */
  poolMax: 10,
} as const

export const AUTH = {
  /** Sessions last a month and refresh daily while in use. */
  sessionExpiresInSeconds: 30 * 24 * 60 * 60,
  sessionUpdateAgeSeconds: 24 * 60 * 60,
  /**
   * Guests get a generated placeholder address (Better Auth anonymous plugin). It is never
   * emailed; `.invalid` is reserved by RFC 2606, so it can never reach a real inbox.
   */
  guestEmailDomain: "guest.konkyo.invalid",
} as const

export const LAYOUT = {
  // The sidebar's own widths (16rem, 3rem rail) live in packages/ui/src/components/sidebar.tsx.
  previewDefaultPercent: 44,
  previewMinPx: 360,
  previewMaxPercent: 65,
  centreMinPx: 480,
  /** Reading measures (characters per line). */
  answerMeasureCh: 72,
  editorMeasureCh: 68,
} as const

export const ZETARIS = {
  /** Our own deadline: Zetaris never times out by itself (a 390 s query ran to the end in S00). */
  queryTimeoutMs: 30_000,
  /**
   * Background work nobody waits on (practice sets, lecture notes, the worker's warm-up). After hours
   * idle, Zetaris's first queries ran past 30 s (in testing) and threw away items the Verifier had passed.
   */
  backgroundTimeoutMs: 90_000,
  /** Default row limit for evidence reads. */
  rowLimit: 10_000,
  database: "konkyo",
  tables: {
    passages: "konkyo_passages",
    pdfText: "konkyo_pdf_text",
  },
} as const

/** Supported uploads (plan F02): extension → file kind. Anything else is "Unsupported". */
export const FILE_TYPES = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".pptx": "pptx",
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
  ".mp3": "audio",
  ".m4a": "audio",
  ".wav": "audio",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
} as const

export type FileKind =
  | (typeof FILE_TYPES)[keyof typeof FILE_TYPES]
  | "web"
  | "youtube"
  | "note"
  | "email"

/**
 * The type a stored original is served with, from its extension: never a type someone else
 * chose (an upload's browser, an email's sender), so a ".pdf" can't arrive as HTML.
 */
export const FILE_MIME: Record<keyof typeof FILE_TYPES, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
}

export const mimeForName = (name: string): string =>
  FILE_MIME[name.slice(name.lastIndexOf(".")).toLowerCase() as keyof typeof FILE_MIME] ??
  "application/octet-stream"

export const kindForName = (name: string): FileKind | undefined => {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase()
  return FILE_TYPES[ext as keyof typeof FILE_TYPES]
}

export const isYouTube = (url: string) =>
  /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)

/** For the file picker's `accept` attribute. */
export const ACCEPT = Object.keys(FILE_TYPES).join(",")

export const LIBRARY = {
  /** While anything is processing, the library refreshes this often. */
  pollMs: 1500,
  pageSize: 100,
} as const

export const INGEST = {
  /** A page with fewer characters than this (and an image) is a scan and gets OCR (S00 rule). */
  scanCharsPerPage: 20,
  ocrImage: "jbarlow83/ocrmypdf-alpine:v17.13.0",
  ocrLanguages: "eng",
  ocrTimeoutMs: 10 * 60 * 1000,
  convertTimeoutMs: 2 * 60 * 1000,
  fetchTimeoutMs: 30_000,
  /** Sent with web and paper downloads; never a personal address. */
  userAgent: "KonkyoBot/1.0 (+https://konkyo.xyz)",
  /** Transcript passages close at a speaker change, a pause, or this length. */
  transcriptPassageSeconds: 45,
  transcriptPauseSeconds: 2.5,
  embeddingModel: "text-embedding-3-small",
  embeddingBatch: 96,
  embeddingParallel: 2,
  transcriptionModel: "scribe_v2",
  /** Short file summaries (cost benchmark: Luna with no reasoning writes grounded text cheaply). */
  summaryModel: "gpt-6-luna",
  /** OpenAlex lookups are a nicety; a slow answer must not hold a file back. */
  metadataTimeoutMs: 8_000,
} as const

export const QUERY = {
  /** Server data is fresh for a minute before TanStack Query refetches in the background. */
  staleTimeMs: 60_000,
} as const

export type ModelEffort = "none" | "minimal" | "low" | "medium"
export type ModelChoice = { id: string; reasoning: ModelEffort }

/**
 * Each agent's OpenAI model (packages/agents/src/models.ts calls them), picked from the measured cost benchmark (gen-ai/.spikes/costs/BENCHMARK.md):
 * the cheapest OpenAI model that met each role's bar, with a fallback for outages and rate limits.
 */
export const MODELS = {
  /** Plans the run; the best support judgement among cheap models (0 false rejections). */
  planner: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Query rewriting and rerank: mechanical work, tool and JSON 3/3. */
  retriever: {
    primary: { id: "gpt-5-nano", reasoning: "minimal" },
    fallback: { id: "gpt-6-luna", reasoning: "none" },
  },
  /** Writes the cited answer: 9/9 quotes verbatim, first token in about 1 s. */
  writer: {
    primary: { id: "gpt-6-luna", reasoning: "none" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Support checks: 0/10 false rejections, 6/6 planted errors caught. */
  verifier: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Deep search: plans queries and runs OpenAI's web_search (needs reasoning above minimal). */
  scout: {
    primary: { id: "gpt-5-nano", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "low" },
  },
  /** Screens found sources against the question, batch by batch (Markovian steps). */
  screener: {
    primary: { id: "gpt-6-luna", reasoning: "none" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Claims and agreement across sources: the same strict-support judgement as the Verifier. */
  analyst: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /**
   * Makes practice items from passages (F27); every answer key then goes to the Verifier.
   * Measured testing, 3 runs × 12 windows: Luna (none) kept 35 items at $0.00025 each (65% pass,
   * ~4 s median draft, but a tail of 28-39 s calls); nano (low) kept 40 at $0.00059 each (60%
   * pass, ~11 s per draft): its reasoning tokens cost more than Luna's higher price. After hints
   * were told never to restate the answer, Luna passed 81-83% at $0.0002 per kept item.
   */
  tutor: {
    primary: { id: "gpt-6-luna", reasoning: "none" },
    fallback: { id: "gpt-5-nano", reasoning: "low" },
  },
  /**
   * Reads a spoken ask that no pattern placed (S16): a one-line JSON pick while you are still
   * talking, so it runs with no reasoning on the fast writer model.
   */
  intent: {
    primary: { id: "gpt-6-luna", reasoning: "none" },
    fallback: { id: "gpt-5-nano", reasoning: "minimal" },
  },
  /** Judges a typed answer the code check couldn't settle, with feedback that never gives it away. */
  grader: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
} as const satisfies Record<string, { primary: ModelChoice; fallback: ModelChoice }>

/**
 * Rate limits (plan §3 "Model calls"). Model calls share one token bucket per server process,
 * set below the OpenAI account's tier; each person has a cap on answers, so a public guest
 * sign-in can't run up the bill.
 */
export const LIMITS = {
  modelRequestsPerMinute: 400,
  modelCallsInFlight: 24,
  answersPerTenMinutes: 20,
  guestAnswersPerDay: 60,
  answersPerDay: 300,
  /** Deep searches download papers ($0.01 each from OpenAlex) and search the web. */
  guestDeepSearchesPerDay: 3,
  deepSearchesPerDay: 20,
  /**
   * Every file is read, embedded and checked in Zetaris (and recordings transcribed), so additions
   * are capped too. A guest's 3 deep searches import about 24, which leaves room to upload.
   */
  guestFilesPerDay: 40,
  filesPerDay: 300,
} as const

/**
 * Public folders (plan F36): anyone with the link can ask, so each visitor and each folder has a
 * cap (the owner's account pays for the answers), and only the last few turns travel back.
 */
export const PUBLIC = {
  answersPerTenMinutesPerVisitor: 5,
  answersPerDayPerVisitor: 20,
  answersPerDayPerFolder: 300,
  historyTurns: 6,
  moderationModel: "omni-moderation-latest",
} as const

/**
 * Connectors (plan F35) through Composio. Tool calls need pinned toolkit versions (S00); our own
 * poll resyncs every 15 minutes, which is Composio-managed auth's fastest trigger anyway, and
 * covers Notion, whose triggers would need a Notion integration of our own.
 */
export const CONNECTORS = {
  versions: { gmail: "20261010_00", googledrive: "20261001_00", notion: "20261008_00" },
  /** Connect links expire after 10 minutes, so each is minted on the click. */
  linkMinutes: 10,
  syncEveryMinutes: 15,
  /** Items per page when browsing a connected account. */
  pageSize: 25,
  /** Google Workspace exports are capped at 10 MB by Google. */
  exportMaxBytes: 10 * 1024 * 1024,
} as const

/**
 * Email through Resend (plan F59). The free plan sends and receives 100 a day and 3,000 a month
 * in total, so every kind of mail here is capped well under that.
 */
export const EMAIL = {
  from: "Konkyo <hello@konkyo.xyz>",
  /** A space's address is <token>@in.konkyo.xyz: its own subdomain, so the root keeps its mail. */
  inboundDomain: "in.konkyo.xyz",
  /** Lowercase letters and digits without look-alikes: addresses are read and typed. */
  inboundTokenLength: 10,
  inboundAlphabet: "abcdefghjkmnpqrstuvwxyz23456789",
  /** Sign-in codes (Better Auth email OTP): six digits, ten minutes, five tries. */
  codeLength: 6,
  codeMinutes: 10,
  codeAttempts: 5,
  /** Codes the server sends a day, for everyone: the free plan's 100 must leave room for the rest. */
  codesPerDay: 50,
  /** Codes one network address may ask for a day, so nobody can spend everyone's. */
  codesPerAddressPerDay: 8,
  /** Invites by email each person can send a day, and everyone together. */
  invitesPerDay: 10,
  invitesPerDayTotal: 30,
  /** Held-mail notices a space's owner gets a day; past them, mail waits without a ping. */
  heldNoticesPerDay: 10,
  /** Mail from someone who isn't in the space waits this long for a yes. */
  heldDays: 7,
  /** At most this many attachments become sources from one email. */
  attachmentsPerEmail: 10,
  fetchTimeoutMs: 30_000,
  /** The weekly digest goes out on Fridays at the hour people chose for reminders. */
  digestWeekday: 5,
} as const

/**
 * Audio briefs (plan F37): two voices talk through a folder. One Text-to-Dialogue request stays
 * reliable to about 2,000 characters (S00), so a brief is one request of about two minutes.
 * Voices and the model are the ones the S00 spike measured.
 */
export const BRIEF = {
  maxChars: 1_900,
  model: "eleven_v3",
  outputFormat: "mp3_44100_128",
  voices: {
    A: { name: "Bella", id: "hpp4J3VqNfWAUOO0d1Us" },
    B: { name: "George", id: "JBFqnCBsd6RMkjVDRZzb" },
  },
  /** Passage windows the script is written from. */
  windows: 8,
  /** The ElevenLabs plan has no overage, so briefs are few a day. */
  guestPerDay: 1,
  perDay: 5,
} as const

/**
 * Talking to Konkyo (plan S16, §16.5). Scribe realtime hears you ($0.39 an hour); ElevenLabs
 * Flash reads answers back with timestamps ($0.04 per 1K characters), every clip cached by its
 * text and voice. The ElevenLabs plan has no overage, so both have a daily fair-use cap.
 */
export const VOICE = {
  /** Konkyo's own voice, and the one that says the example asks (you, asking). */
  speaker: { name: "Bella", id: "hpp4J3VqNfWAUOO0d1Us" },
  asker: { name: "George", id: "JBFqnCBsd6RMkjVDRZzb" },
  /**
   * The voices Konkyo can answer in (the sounds popover): ElevenLabs' default voices made for
   * explaining things clearly (labels from GET /v2/voices, testing). The first is the default.
   */
  voices: [
    { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", about: "bright and warm" },
    { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", about: "a clear British teacher" },
    { id: "SAz9YHcvj6GT2YYXdXww", name: "River", about: "relaxed and even" },
    { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", about: "a steady British broadcaster" },
    { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", about: "knowledgeable and upbeat" },
    { id: "cjVigY5qzO86Huf0OWal", name: "Eric", about: "smooth and calm" },
  ],
  /** What a voice says when you try it in the sounds popover (made once, then cached). */
  sampleLine: "Here's what your sources say, and every quote is checked against its page.",
  ttsModel: "eleven_flash_v2_5",
  outputFormat: "mp3_44100_64",
  /** After a spoken ask it says the short answer: the first sentences up to about this long. */
  shortAnswerChars: 320,
  /** ▶ listen on any answer reads at most this much. */
  maxSpeakChars: 2_400,
  /** Voice sessions a day (one Scribe token each, up to 15 minutes). */
  sessionsPerDay: 80,
  guestSessionsPerDay: 12,
  /** Characters newly read aloud a day (cached clips are free). */
  speakCharsPerDay: 8_000,
  guestSpeakCharsPerDay: 1_500,
} as const

/** Deep search (plan F18): how long it waits for imports before answering from what's ready. */
export const DEEP = {
  importWaitMs: 8 * 60_000,
  pollMs: 2_500,
} as const

/** Notes (plan F21, F24): how often the editor saves, and how often a version is kept. */
export const NOTES = {
  autosaveMs: 1_200,
  /** An autosave starts a new version once the last one is this old. */
  versionEveryMs: 10 * 60_000,
  /** The note is re-read for chat (passages, embeddings, Zetaris) this long after typing stops. */
  indexAfterMs: 20_000,
} as const

/** Study (plan F27–F31): how much a set reads, how big a round is, how many sets a day. */
export const STUDY = {
  /** Passage windows a set reads: one file, then two more per extra file, up to the cap. */
  windowsForOneFile: 6,
  windowsPerExtraFile: 2,
  windowsMax: 14,
  /** Windows worked on at once (each is a Tutor call, a Verifier call and a Zetaris statement). */
  concurrency: 4,
  /** Compare-the-sources items a set tries for, when it spans two or more files. */
  comparisons: 3,
  /** A quiz or game round; a review round takes what's due, up to this many. */
  roundSize: 8,
  reviewRoundMax: 20,
  /** A new set's round starts once this many items have passed every check. */
  startAfter: 6,
  guestSetsPerDay: 6,
  setsPerDay: 40,
} as const

/**
 * Study together (plan F58): a live round of checked questions, played at once by everyone in its
 * lobby. Codes skip look-alike characters (0/O, 1/I/L) so they can be read out loud.
 */
export const ROUNDS = {
  codeLength: 6,
  codeAlphabet: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  questions: 8,
  /** The soft timer: answers stay face down until everyone answers or it runs out. */
  secondsPerQuestion: 30,
  /** Options for a recall question, drawn from other answers in the same practice set. */
  choices: 4,
  maxPlayers: 30,
  /** A round with no join, answer or move for this long is over (a lobby nobody started). */
  idleMinutes: 30,
  /** Wrong codes allowed per person and per address in a window, against guessing. */
  joinMisses: 12,
  joinMissWindowMinutes: 10,
  perDay: 20,
} as const

/** Trash keeps files, folders, chats and notes this long before deleting them for good (F04). */
export const TRASH = { keepDays: 30 } as const

export const ROUTES = {
  home: "/home",
  signIn: "/sign-in",
  settings: "/settings",
  library: "/library",
  trash: "/trash",
} as const

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

/**
 * Spaces (plan §16.4, F45): a top-level folder owns one identity colour and one wall. Colours and
 * walls are OurSpaces' own values; `text` is the lighter step used when the colour is text on the
 * plum room (≥4.5:1). Ink on a wall comes from the preset, never from guesswork.
 */
export const SPACES = {
  colors: {
    violet: { hex: "#7853ff", text: "#9d85ff" },
    pink: { hex: "#e9369d", text: "#ff5fb4" },
    cobalt: { hex: "#3f70ff", text: "#7a9bff" },
    orange: { hex: "#ff7c42", text: "#ff7c42" },
    teal: { hex: "#13b8a6", text: "#13b8a6" },
    butter: { hex: "#ffb02e", text: "#ffb02e" },
  },
  walls: {
    night: { bg: "#211922", ink: "#ffffff" },
    lagoon: { bg: "#12a594", ink: "#111114" }, // measured 6.1:1; OurSpaces' white is 3.1:1
    spruce: { bg: "#0f5c50", ink: "#ffffff" },
    cobalt: { bg: "#3f70ff", ink: "#0b0b0e" }, // 4.65:1; white is 4.22
    midnight: { bg: "#1f1b2d", ink: "#ffffff" },
    violet: { bg: "#b7a7ff", ink: "#1b1532" },
    blush: { bg: "#ffdad6", ink: "#111114" },
    butter: { bg: "#ffe9c2", ink: "#111114" },
    mint: { bg: "#bfe9dc", ink: "#102e27" },
    clean: { bg: "#f4f4f2", ink: "#111114" },
  },
  /** The wall a colour gets by default (each colour has a wall that flatters it). */
  defaultWall: {
    violet: "violet",
    pink: "blush",
    cobalt: "cobalt",
    orange: "butter",
    teal: "lagoon",
    butter: "mint",
  },
  /**
   * Symbols are typographic glyphs on the tile, as OurSpaces does (✦ ♥ ☺ ◎ …), never an icon set:
   * a space without a cover shows its glyph.
   */
  symbols: ["✦", "✎", "◎", "☾", "∑", "♪", "✿", "❖", "☀", "⚑", "◐", "✺"],
} as const

/**
 * Looks (plan §16.4, F53): the twelve faces from scripts/make-images.mjs, in its order, each on its
 * space colour. A look carries a placeholder name (OurSpaces' personas) that the next look may
 * replace; a name someone typed is theirs and stays.
 */
export const LOOKS = [
  { id: "look-01", name: "juno", color: "violet" },
  { id: "look-02", name: "momo", color: "pink" },
  { id: "look-03", name: "pico", color: "cobalt" },
  { id: "look-04", name: "wren", color: "orange" },
  { id: "look-05", name: "ziggy", color: "teal" },
  { id: "look-06", name: "clover", color: "butter" },
  { id: "look-07", name: "pepper", color: "violet" },
  { id: "look-08", name: "kiwi", color: "pink" },
  { id: "look-09", name: "miso", color: "cobalt" },
  { id: "look-10", name: "mochi", color: "orange" },
  { id: "look-11", name: "hoot", color: "teal" },
  { id: "look-12", name: "fig", color: "butter" },
] as const

export type LookId = (typeof LOOKS)[number]["id"]

/** Published articles (F57). */
export const ARTICLES = {
  /** Publishes (and republishes) a person can make in a day. */
  perDay: 3,
  /** The random tail of a slug, so two "notes on sleep" don't collide. */
  slugRandom: 6,
  slugMax: 60,
  /** A citation card shows this much of the passage around its quote. */
  contextChars: 600,
  summaryMax: 280,
  titleMax: 140,
  /** Moderation reads every word, in pieces this long; an article is at most this many pieces. */
  moderateChunk: 4_000,
  moderateChunks: 12,
  /** Cited page images and the cover are this wide. */
  pageWidth: 900,
  /** ▶ listen reads the first this-many characters. */
  listenChars: 2_400,
} as const

/** People (F53, F54): names, handles, bios and photos. */
export const PEOPLE = {
  nameMax: 32,
  /** Handles are lowercase letters, digits and underscores, for kept accounts only. */
  handlePattern: "^[a-z0-9_]{3,24}$",
  handleMax: 24,
  bioMax: 160,
  /** A photo is cropped to a square in the browser; the server takes at most this much. */
  photoPx: 256,
  photoMaxBytes: 512 * 1024,
  /** Follows a person can make in a day (F55): plenty for people, not for a script. */
  followsPerDay: 100,
  /** "N here right now" on the enter card counts people active this recently. */
  hereWindowMinutes: 15,
  /** Handles nobody can take: they would read as Konkyo itself or shadow a route. */
  reservedHandles: [
    "admin",
    "api",
    "app",
    "about",
    "help",
    "home",
    "konkyo",
    "library",
    "login",
    "me",
    "people",
    "settings",
    "sign_in",
    "signin",
    "spaces",
    "staff",
    "support",
    "system",
    "team",
  ],
} as const

export type SpaceColor = keyof typeof SPACES.colors
export type SpaceWall = keyof typeof SPACES.walls

/** Interface sounds (plan §16.5): Mixkit free licence, trimmed per OurSpaces' sound README. */
export const SOUNDS = {
  files: {
    tap: "/sounds/tap.mp3",
    place: "/sounds/place.mp3",
    check: "/sounds/check.mp3",
    promote: "/sounds/promote.mp3",
  },
  volumes: { tap: 0.34, place: 0.42, check: 0.4, promote: 0.52 },
  /** localStorage key for the mute switch (the server copy lives in user_settings). */
  storageKey: "konkyo:interface-sounds",
} as const

export type UiSound = keyof typeof SOUNDS.files

/** House motion beats (OurSpaces voiceTimings / entrance): stagger between arrivals, tilt range. */
export const MOTION = {
  stagger: 40,
  waveMax: 300,
  tiltStep: 1.1,
  tiltWidth: 240,
} as const
