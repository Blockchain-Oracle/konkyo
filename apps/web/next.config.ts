import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Self-hosted on Coolify: a minimal server bundle with only the files it needs.
  output: "standalone",
  // Partial prerendering: static shells paint at once; dynamic parts stream in Suspense.
  cacheComponents: true,
  // Links prefetch those static shells, so navigation feels instant.
  partialPrefetching: true,
  typedRoutes: true,
  // Workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: [
    "@konkyo/agents",
    "@konkyo/config",
    "@konkyo/db",
    "@konkyo/ingest",
    "@konkyo/env",
    "@konkyo/jobs",
    "@konkyo/storage",
    "@konkyo/study",
    "@konkyo/ui",
    "@konkyo/zetaris",
  ],
  async redirects() {
    // The Dala landing page takes "/" in S10; until then the root opens the app.
    return [{ source: "/", destination: "/home", permanent: false }]
  },
}

export default nextConfig
