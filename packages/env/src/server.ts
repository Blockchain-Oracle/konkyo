import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Server-only environment, shared by the web app and the worker.
 * Validated once at import; a missing or malformed value fails fast with its name.
 * Set SKIP_ENV_VALIDATION=1 only for builds that never run (CI, Docker image builds).
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    DATABASE_URL: z.url(),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    /** Where the server reaches S3 (MinIO in compose). */
    S3_ENDPOINT: z.url(),
    /** Where browsers reach S3 for presigned uploads; differs from S3_ENDPOINT behind Docker. */
    S3_PUBLIC_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),

    GOTENBERG_URL: z.url(),

    /** OpenAI's API: the Writer, Verifier, Analyst, Tutor and Grader, and deep search's web search. */
    OPENAI_API_KEY: z.string().min(1),
    /** NVIDIA's API (build.nvidia.com): every Nemotron model Konkyo calls. */
    NVIDIA_API_KEY: z.string().min(1),
    /** Where the models are served, when not NVIDIA's API: a self-hosted NIM with the same ids. */
    MODEL_BASE_URL: z.url().optional(),
    /** This process's share of each model's rate limit (web and worker split one key's budget). */
    MODEL_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().optional(),
    ELEVENLABS_API_KEY: z.string().min(1),
    OPENALEX_API_KEY: z.string().min(1).optional(),

    /** Zetaris REST base, e.g. http://localhost:8888/api/v1.0 */
    ZETARIS_REST_URL: z.url(),
    /** Production (event instance): an API key. Local bundle: the UI login below. */
    ZETARIS_API_KEY: z.string().min(1).optional(),
    ZETARIS_LOGIN_URL: z.url().optional(),
    ZETARIS_USERNAME: z.string().min(1).optional(),
    ZETARIS_PASSWORD: z.string().min(1).optional(),
    ZETARIS_ORG_ID: z.string().min(1).optional(),
    /** Where the worker writes evidence files, and where Zetaris reads the same folder. */
    EVIDENCE_DIR: z.string().min(1),
    ZETARIS_EVIDENCE_URI: z.string().min(1),

    // Connectors (F35) through Composio: the API key and one auth config per toolkit.
    COMPOSIO_API_KEY: z.string().min(1).optional(),
    COMPOSIO_AUTH_CONFIG_GMAIL: z.string().min(1).optional(),
    COMPOSIO_AUTH_CONFIG_GOOGLEDRIVE: z.string().min(1).optional(),
    COMPOSIO_AUTH_CONFIG_NOTION: z.string().min(1).optional(),
    /** Web Push (F41): without the keys, the Inbox still works and push is simply off. */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    VAPID_SUBJECT: z.string().min(1).default("https://konkyo.xyz"),

    /** Email through Resend (F59): without the key, email sign-in, invites and the digest are off. */
    RESEND_API_KEY: z.string().min(1).optional(),
    /** The signing secret of the webhook that delivers mail sent to a space's address. */
    RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
    /** Overrides EMAIL.from / EMAIL.inboundDomain (a test server on another domain). */
    EMAIL_FROM: z.string().min(1).optional(),
    INBOUND_EMAIL_DOMAIN: z.string().min(1).optional(),

    /** The public folder the landing page's live demo asks (`pnpm konkyo seed` prints it). */
    DEMO_SHARE_SLUG: z.string().min(1).optional(),
    /** Who reads reports of articles (comma-separated user ids): each lands in their Inbox. */
    ADMIN_USER_IDS: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
})
