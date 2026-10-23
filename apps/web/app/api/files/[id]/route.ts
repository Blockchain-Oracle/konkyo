import { z } from "zod"
import { route } from "@/lib/api"
import { editDetails, getFileDetail } from "@/lib/library"
import { trashFiles } from "@/lib/trash"

export const GET = route<{ id: string }>(async ({ userId, params }) =>
  getFileDetail(userId, params.id),
)

const name = z.object({
  family: z.string().max(200).optional(),
  given: z.string().max(200).optional(),
  literal: z.string().max(300).optional(),
})

/** The person's corrections to the title and citation details (plan F06). */
export const PATCH = route<{ id: string }, Parameters<typeof editDetails>[2]>(
  async ({ userId, params, body }) => editDetails(userId, params.id, body),
  z.object({
    title: z.string().min(1).max(500).optional(),
    csl: z
      .object({
        type: z.string().max(40),
        title: z.string().max(1000).optional(),
        author: z.array(name).max(100).optional(),
        issued: z.object({ "date-parts": z.array(z.array(z.number().int())) }).optional(),
        "container-title": z.string().max(500).optional(),
        publisher: z.string().max(300).optional(),
        volume: z.string().max(40).optional(),
        issue: z.string().max(40).optional(),
        page: z.string().max(40).optional(),
        DOI: z.string().max(200).optional(),
        URL: z.string().max(2000).optional(),
      })
      .optional(),
  }),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  trashFiles(userId, [params.id]),
)
