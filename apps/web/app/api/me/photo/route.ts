import { PEOPLE } from "@konkyo/config"
import { route } from "@/lib/api"
import { LibraryError } from "@/lib/library"
import { removePhoto, setPhoto } from "@/lib/profiles"

/** Reads a request body, refusing it as soon as it grows past `max` bytes (no header needed). */
async function readCapped(request: Request, max: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      throw new LibraryError("That photo is too big", 413)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

/** A photo of you: the body is the cropped square (the server re-encodes it). */
export const PUT = route(async ({ userId, request }) =>
  setPhoto(userId, await readCapped(request, PEOPLE.photoMaxBytes)),
)

export const DELETE = route(async ({ userId }) => removePhoto(userId))
