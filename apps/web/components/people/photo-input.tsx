"use client"

/*
 * Choosing your own photo for your face.
 */

import { type ChangeEvent, forwardRef, useState } from "react"
import { toast } from "sonner"
import { squareAvatar } from "@/lib/avatar-photo"
import { sound } from "@/lib/sounds"

/**
 * The hidden file input behind every "my photo" tap: crops to a 256 px square and hands the
 * bytes on (the enter card keeps them until you walk in; the settings card uploads at once).
 */
export const PhotoInput = forwardRef<
  HTMLInputElement,
  { onPhoto: (photo: Blob) => Promise<unknown> | undefined; onBusy?: (busy: boolean) => void }
>(function PhotoInput({ onPhoto, onBusy }, ref) {
  const [busy, setBusy] = useState(false)
  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file || busy) return
    setBusy(true)
    onBusy?.(true)
    try {
      await onPhoto(await squareAvatar(file))
      sound("tap")
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
      onBusy?.(false)
      input.value = ""
    }
  }
  return (
    <input
      ref={ref}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic"
      hidden
      onChange={(event) => void onChange(event)}
    />
  )
})
