import { PEOPLE } from "@konkyo/config"
import { route } from "@/lib/api"
import { LibraryError } from "@/lib/library"
import { removePhoto, setPhoto } from "@/lib/profiles"

/** A photo of you: the body is the cropped square itself (image/jpeg from the browser). */
export const PUT = route(async ({ userId, request }) => {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > PEOPLE.photoMaxBytes) throw new LibraryError("That photo is too big", 413)
  return setPhoto(userId, new Uint8Array(await request.arrayBuffer()))
})

export const DELETE = route(async ({ userId }) => removePhoto(userId))
