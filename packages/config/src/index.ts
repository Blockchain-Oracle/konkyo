/**
 * Every product constant lives here: limits, timeouts, sizes, ports and names.
 * Code elsewhere imports these instead of writing numbers inline.
 */

export const APP = {
  name: "Konkyo",
  tagline: "Every answer shows its grounds.",
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

export const QUERY = {
  /** Server data is fresh for a minute before TanStack Query refetches in the background. */
  staleTimeMs: 60_000,
} as const

export const ROUTES = {
  home: "/home",
  signIn: "/sign-in",
} as const

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const
