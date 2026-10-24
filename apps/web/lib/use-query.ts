"use client"

import { useQuery as useTanstackQuery } from "@tanstack/react-query"
import { useHydrated } from "./use-hydrated"

/**
 * TanStack's useQuery, hydration-safe. Pages hydrate in pieces: the shell (rail, dock) hydrates
 * first and its queries can land before a page's own boundary hydrates, so that page's first
 * client render would show data the server's HTML didn't have (seen on Home, Library, Study and
 * spaces). While hydrating, every query reads as the server rendered it, pending; the cached
 * answer follows on the next render. Navigating never hydrates, so it is never held back.
 */
export const useQuery = ((options, client) => {
  const result = useTanstackQuery(options, client)
  const hydrated = useHydrated()
  if (hydrated) return result
  return {
    ...result,
    data: undefined,
    status: "pending",
    isPending: true,
    isLoading: result.isFetching,
    isSuccess: false,
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isPlaceholderData: false,
    dataUpdatedAt: 0,
  }
}) as typeof useTanstackQuery
