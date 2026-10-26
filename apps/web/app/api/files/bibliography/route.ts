import { db, schema } from "@konkyo/db"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { route } from "@/lib/api"
import { toBibtex } from "@/lib/citation"

const { files } = schema

/**
 * A BibTeX file for the chosen files. Files with no citation
 * record yet are counted, so the person knows which to fill in.
 */
export const POST = route(
  async ({ userId, body }) => {
    const rows = await db
      .select({ title: files.title, meta: files.meta })
      .from(files)
      .where(and(eq(files.ownerId, userId), inArray(files.id, body.fileIds)))
    const cited = rows.filter((r) => r.meta?.csl)
    return {
      bibtex: cited.map((r) => toBibtex(r.meta?.csl ?? { type: "misc" }, r.title)).join("\n\n"),
      included: cited.length,
      missing: rows.length - cited.length,
    }
  },
  z.object({ fileIds: z.array(z.uuid()).min(1).max(1000) }),
)
