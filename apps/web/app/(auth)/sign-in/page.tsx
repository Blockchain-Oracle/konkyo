import { APP, ROUTES } from "@konkyo/config"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { BrandMark } from "@/components/brand-mark"
import { getSession } from "@/lib/session"
import { SignInActions } from "./sign-in-actions"

export const metadata: Metadata = { title: "Sign in" }

/** Only same-site paths are honoured, so `?next=` can never send someone to another site. */
function safeNext(value: string | string[] | undefined): string {
  const next = typeof value === "string" ? value : undefined
  return next?.startsWith("/") && !next.startsWith("//") ? next : ROUTES.home
}

async function RedirectIfSignedIn({ searchParams }: PageProps<"/sign-in">) {
  const [session, params] = await Promise.all([getSession(), searchParams])
  if (session) redirect(safeNext(params.next) as never)
  return <SignInActions next={safeNext(params.next)} />
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <main className="grid min-h-svh place-items-center px-6 py-15">
      <div className="flex w-full max-w-[26rem] flex-col">
        <p className="inline-flex items-center gap-2 text-nav-label font-semibold text-bone-white uppercase">
          <BrandMark small className="size-5" />
          {APP.name}
        </p>

        <p className="mt-15 text-micro text-saffron-spark uppercase">Your library, checked</p>
        <h1 className="mt-3 text-subheading font-normal sm:text-heading-sm">{APP.tagline}</h1>
        <p className="mt-4.5 text-body font-extralight text-bone-white">
          Ask anything about your files. Every quote is checked against its source before you see
          it.
        </p>

        <Suspense fallback={<div className="mt-9 h-[6.5rem]" aria-hidden />}>
          <RedirectIfSignedIn {...props} />
        </Suspense>
      </div>
    </main>
  )
}
