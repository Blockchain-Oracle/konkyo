"use client"

import { toast } from "sonner"
import { sound } from "@/lib/sounds"

/** Share someone's page: the phone's share sheet where there is one, else the link copied. */
export function ShareProfile({ handle, name }: { handle: string; name: string }) {
  return (
    <button
      type="button"
      className="me-ghost"
      onClick={async () => {
        const url = `${window.location.origin}/u/${handle}`
        sound("tap")
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
          await navigator.share({ title: `${name} on Konkyo`, url }).catch(() => undefined)
          return
        }
        await navigator.clipboard.writeText(url)
        toast.success("Link copied")
      }}
    >
      share
    </button>
  )
}
