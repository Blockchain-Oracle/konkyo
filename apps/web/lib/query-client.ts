import { QUERY } from "@konkyo/config"
import { defaultShouldDehydrateQuery, isServer, QueryClient } from "@tanstack/react-query"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: QUERY.staleTimeMs },
      dehydrate: {
        // Stream queries that are still loading from server components to the client.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/** TanStack's Next.js pattern: a new client per server request, one per browser tab. */
export function getQueryClient() {
  if (isServer) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
