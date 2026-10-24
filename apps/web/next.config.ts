import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Self-hosted on Coolify: a minimal server bundle with only the files it needs.
  output: "standalone",
  // Partial prerendering: static shells paint at once; dynamic parts stream in Suspense.
  cacheComponents: true,
  // Links prefetch those static shells, so navigation feels instant.
  partialPrefetching: true,
  typedRoutes: true,
  // Dev only: a second session (a test guest) runs on 127.0.0.1 beside the signed-in localhost
  // one; each origin keeps its own cookie.
  allowedDevOrigins: ["127.0.0.1"],
  // Workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: [
    "@konkyo/agents",
    "@konkyo/config",
    "@konkyo/connectors",
    "@konkyo/db",
    "@konkyo/ingest",
    "@konkyo/env",
    "@konkyo/jobs",
    "@konkyo/notify",
    "@konkyo/storage",
    "@konkyo/study",
    "@konkyo/tape",
    "@konkyo/ui",
    "@konkyo/zetaris",
  ],
  async redirects() {
    // The Dala landing page takes "/" in S10; until then the root opens the app.
    return [{ source: "/", destination: "/home", permanent: false }]
  },
}

export default nextConfig
