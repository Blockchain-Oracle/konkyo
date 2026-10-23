"use client"

import type { StudyScope } from "@konkyo/db/schema"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { toast } from "sonner"
import { api } from "./fetcher"
import type { SetSummary, TodaySummary } from "./study"

export const studyKeys = {
  all: ["study"] as const,
  today: ["study", "today"] as const,
  sets: ["study", "sets"] as const,
  set: (id: string) => ["study", "set", id] as const,
}

/** Today's review and the streak (Home's card and the Study page). */
export function useToday(enabled = true) {
  return useQuery({
    queryKey: studyKeys.today,
    queryFn: () => api<TodaySummary>("/api/study/today"),
    enabled,
    staleTime: 30_000,
  })
}

export function useSets() {
  return useQuery({
    queryKey: studyKeys.sets,
    queryFn: () => api<{ sets: SetSummary[] }>("/api/study/sets").then((r) => r.sets),
    // While a set is being made, its counts move.
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === "generating") ? 2_000 : false),
  })
}

/** One set, polled while it's being made so the round can start as soon as enough passed. */
export function useSet(id: string | undefined) {
  return useQuery({
    queryKey: studyKeys.set(id ?? ""),
    queryFn: () => api<SetSummary>(`/api/study/sets/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === "generating" ? 1_200 : false),
  })
}

export const sessionHref = (params: { mode: string; set?: string; ids?: string[] }): Route => {
  const q = new URLSearchParams({ mode: params.mode })
  if (params.set) q.set("set", params.set)
  if (params.ids?.length) q.set("ids", params.ids.join(","))
  return `/study/session?${q}` as Route
}

/** Quiz me: make a set from files or folders and go straight to its round. */
export function useQuizMe() {
  const queryClient = useQueryClient()
  return async (scope: StudyScope, title?: string) => {
    const { id } = await api<{ id: string }>("/api/study/sets", {
      method: "POST",
      json: { scope, title },
    })
    void queryClient.invalidateQueries({ queryKey: studyKeys.sets })
    return sessionHref({ mode: "quiz", set: id })
  }
}

/**
 * Study actions on a file or folder (library menus, the source pane): Quiz me, and Make notes
 * from a lecture or any source (F32), each with its own feedback.
 */
export function useStudyActions() {
  const quizMe = useQuizMe()
  return {
    quizMe: async (scope: StudyScope, title: string | undefined, push: (href: Route) => void) => {
      try {
        push(await quizMe(scope, title))
      } catch (error) {
        toast.error((error as Error).message)
      }
    },
    makeNotes: async (file: { id: string; title: string }, push: (href: Route) => void) => {
      const id = toast.loading(`Writing notes from “${file.title}”…`, {
        description: "Every point cites the moment or page it comes from.",
      })
      try {
        const note = await api<{ id: string; points: number }>("/api/study/notes", {
          method: "POST",
          json: { fileId: file.id },
        })
        toast.success(`Notes ready · ${note.points} cited points`, {
          id,
          description: undefined,
          action: { label: "Open", onClick: () => push(`/write/${note.id}` as Route) },
        })
      } catch (error) {
        toast.error((error as Error).message, { id, description: undefined })
      }
    },
  }
}
