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
    "@konkyo/config",
    "@konkyo/db",
    "@konkyo/env",
    "@konkyo/storage",
    "@konkyo/ui",
  ],
  async redirects() {
    // The Dala landing page takes "/" in S10; until then the root opens the app.
    return [{ source: "/", destination: "/home", permanent: false }]
  },
}

export default nextConfig
