import "server-only"
import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { articleImageKey } from "./articles"

/** An article's cover or a cited page, while it's published (versioned addresses). */
export async function articleImage(slug: string, n: number | null) {
  const key = await articleImageKey(slug, n)
  if (!key) return NextResponse.json({ error: "No image" }, { status: 404 })
  try {
    const object = await streamObject(key)
    return new Response(object.body, {
      headers: {
        "Content-Type": "image/webp",
        // Not shared caches: unpublishing must stop the bytes too.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "No image" }, { status: 404 })
  }
}
