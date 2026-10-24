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
  /** The docs site (apps/docs), once deployed (S11). */
  docs: null as string | null,
} as const

/**
 * The landing's particle field (plan §8): how many outlined triangles by device class (phones get
 * fewer: the field sits behind text there and costs battery), and the pixel ratio cap.
 */
export const LANDING = {
  particles: { phone: 2400, desktop: 6400 },
  maxPixelRatio: { phone: 1.5, desktop: 2 },
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

/** Trash keeps files, folders, chats and notes this long before deleting them for good (F04). */
export const TRASH = { keepDays: 30 } as const

export const ROUTES = {
  home: "/home",
  signIn: "/sign-in",
  library: "/library",
  trash: "/trash",
} as const

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const
