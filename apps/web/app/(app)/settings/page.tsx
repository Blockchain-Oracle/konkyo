import { Skeleton } from "@konkyo/ui/components/skeleton"
import { ChevronRightIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageShell } from "@/components/page-shell"
import { getSession } from "@/lib/session"
import { DeepSearchSetting } from "./deep-search-setting"

export const metadata: Metadata = { title: "Settings" }

async function Account() {
  const session = await getSession()
  if (!session) return null
  const { user } = session
  const rows = user.isAnonymous
    ? [
        {
          label: "Signed in as",
          value: "Guest (continue with Google from the account menu to keep your work)",
        },
      ]
    : [
        { label: "Name", value: user.name },
        { label: "Email", value: user.email },
        { label: "Signed in with", value: "Google" },
      ]
  return (
    <dl className="divide-y divide-border border-y border-border">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]">
          <dt className="text-ui text-ash-gray">{row.label}</dt>
          <dd className="text-ui text-bone-white">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function SettingsPage() {
  return (
    <PageShell title="Settings">
      <section aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-micro text-saffron-spark uppercase">
          Account
        </h2>
        <div className="mt-4.5">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Account />
          </Suspense>
        </div>
      </section>
      <section aria-labelledby="deep-heading" className="mt-15">
        <h2 id="deep-heading" className="text-micro text-saffron-spark uppercase">
          Deep search
        </h2>
        <div className="mt-4.5">
          <DeepSearchSetting />
        </div>
      </section>
      <section aria-labelledby="memory-heading" className="mt-15">
        <h2 id="memory-heading" className="text-micro text-saffron-spark uppercase">
          Memory
        </h2>
        <Link
          href="/settings/memory"
          className="mt-4.5 flex items-center gap-3 border-y border-border py-4 text-ui text-bone-white hover:text-silver-mist"
        >
          <span className="flex-1">
            What Konkyo remembers
            <span className="mt-0.5 block text-snippet text-ash-gray">
              Corrections from your 👎, read before every answer. View, edit or forget them.
            </span>
          </span>
          <ChevronRightIcon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
        </Link>
      </section>
    </PageShell>
  )
}
