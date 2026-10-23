import { Skeleton } from "@konkyo/ui/components/skeleton"
import type { Metadata } from "next"
import { Suspense } from "react"
import { PageShell } from "@/components/page-shell"
import { getSession } from "@/lib/session"

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
    </PageShell>
  )
}
