"use client"

import { Button } from "@konkyo/ui/components/button"
import { Spinner } from "@konkyo/ui/components/spinner"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

type Pending = "google" | "guest" | null

export function SignInActions({ next }: { next: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<Pending>(null)

  async function google() {
    setPending("google")
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: next })
    if (error) {
      setPending(null)
      toast.error("Google sign-in didn't start. Try again.")
    }
  }

  async function guest() {
    setPending("guest")
    const { error } = await authClient.signIn.anonymous()
    if (error) {
      setPending(null)
      toast.error("Couldn't start a guest session. Try again.")
      return
    }
    router.replace(next as never)
    router.refresh()
  }

  return (
    <div className="mt-9 flex flex-col gap-3">
      {/* Google's dark sign-in button: #131314 fill, #8E918F stroke, #E3E3E3 text, pill. */}
      <button
        type="button"
        onClick={google}
        disabled={pending !== null}
        className="inline-flex h-11 items-center justify-center gap-2.5 rounded-full border border-[#8E918F] bg-[#131314] pr-3 pl-3 text-sm/5 font-medium text-[#E3E3E3] transition-[transform,opacity] duration-(--duration-press) ease-out active:scale-[0.97] disabled:opacity-60 motion-reduce:active:scale-100"
      >
        {pending === "google" ? (
          <Spinner className="size-5" />
        ) : (
          // biome-ignore lint/performance/noImgElement: a static SVG brand mark needs no image optimisation
          <img src="/logos/google.svg" alt="" width={20} height={20} className="size-5" />
        )}
        Continue with Google
      </button>

      <Button
        variant="ghost"
        size="lg"
        onClick={guest}
        disabled={pending !== null}
        className="h-11"
      >
        {pending === "guest" && <Spinner />}
        Try it without an account
      </Button>

      <p className="mt-3 text-meta text-ash-gray">
        Guests keep everything they make when they later continue with Google.
      </p>
    </div>
  )
}
