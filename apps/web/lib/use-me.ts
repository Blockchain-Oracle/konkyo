"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import type { Me, ProfilePatch } from "./profiles"
import { qk } from "./query-keys"

export type { Me, ProfilePatch }

/** You (F53): read once per page, saved with the change shown at once and rolled back on refusal. */
export function useMe() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: qk.people.me, queryFn: () => api<Me>("/api/me/profile") })
  const settle = (me: Me) => {
    queryClient.setQueryData(qk.people.me, me)
    // faces show up in the rail and in spaces; the server already has the new one
    void queryClient.invalidateQueries({ queryKey: ["spaces"] })
  }
  const save = useMutation({
    mutationFn: (patch: ProfilePatch) =>
      api<Me>("/api/me/profile", { method: "PATCH", json: patch }),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<Me>(qk.people.me)
      if (previous && patch.name !== undefined)
        queryClient.setQueryData<Me>(qk.people.me, {
          ...previous,
          name: patch.name,
          face: { ...previous.face, name: patch.name },
        })
      return { previous }
    },
    onSuccess: settle,
    onError: (error: Error, _patch, context) => {
      queryClient.setQueryData(qk.people.me, context?.previous)
      toast.error(error.message)
    },
  })
  const photo = useMutation({
    mutationFn: (blob: Blob) =>
      api<Me>("/api/me/photo", {
        method: "PUT",
        body: blob,
        headers: { "content-type": blob.type || "image/jpeg" },
      }),
    onSuccess: settle,
    onError: (error: Error) => toast.error(error.message),
  })
  return { me: data, save, photo }
}

/** Saves a profile change without the hook (the enter card, right after a guest session starts). */
export const saveProfile = (patch: ProfilePatch) =>
  api<Me>("/api/me/profile", { method: "PATCH", json: patch })

export const uploadPhoto = (blob: Blob) =>
  api<Me>("/api/me/photo", {
    method: "PUT",
    body: blob,
    headers: { "content-type": blob.type || "image/jpeg" },
  })
