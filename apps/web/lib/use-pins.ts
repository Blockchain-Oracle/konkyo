"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import type { Pin } from "./pins"
import { qk } from "./query-keys"

/** A space's pinned answers, newest first. */
export function usePins(spaceId: string) {
  return useQuery({
    queryKey: qk.spaces.pins(spaceId),
    queryFn: () => api<{ pins: Pin[] }>(`/api/spaces/${spaceId}/pins`).then((r) => r.pins),
  })
}

export function useUnpin(spaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pinId: string) =>
      api(`/api/spaces/${spaceId}/pins/${pinId}`, { method: "DELETE" }),
    onMutate: async (pinId) => {
      await queryClient.cancelQueries({ queryKey: qk.spaces.pins(spaceId) })
      const before = queryClient.getQueryData<Pin[]>(qk.spaces.pins(spaceId))
      queryClient.setQueryData<Pin[]>(qk.spaces.pins(spaceId), (pins) =>
        pins?.filter((p) => p.id !== pinId),
      )
      return { before }
    },
    onError: (_error, _pinId, context) =>
      queryClient.setQueryData(qk.spaces.pins(spaceId), context?.before),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.spaces.pins(spaceId) }),
  })
}
