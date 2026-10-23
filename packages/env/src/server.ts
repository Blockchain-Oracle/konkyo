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

    OPENAI_API_KEY: z.string().min(1),
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

    /** Web Push (F41): without the keys, the Inbox still works and push is simply off. */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    VAPID_SUBJECT: z.string().min(1).default("https://konkyo.xyz"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
})
