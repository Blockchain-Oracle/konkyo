import { PEOPLE } from "@konkyo/config"

/*
 * A chosen photo, cropped square and shrunk before it's uploaded as a face.
 */

/**
 * A photo of you, made small: centre-square crop, 256 px, JPEG. Drawing it onto a canvas also
 * leaves behind everything the camera wrote into the file, like where it was taken.
 */
export async function squareAvatar(file: File, size: number = PEOPLE.photoPx): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser can't make a photo here")
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that photo"))),
      "image/jpeg",
      0.86,
    ),
  )
}
