import { db, schema } from "@konkyo/db"
import { streamObject } from "@konkyo/storage"
import { and, eq, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"

/** A source's polaroid (page one, its og:image or video thumbnail), from our own origin. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const { id } = await ctx.params
  const [file] = await db
    .select({ key: schema.files.thumbKey })
    .from(schema.files)
    .where(
      and(
        eq(schema.files.id, id),
        eq(schema.files.ownerId, session.user.id),
        isNull(schema.files.deletedAt),
      ),
    )
  if (!file?.key) return new Response(null, { status: 404 })
  const object = await streamObject(file.key, null)
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
