import { Skeleton } from "@konkyo/ui/components/skeleton"
import { ChevronRightIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageShell } from "@/components/page-shell"
import { getSession } from "@/lib/session"
import { AccountActions } from "./account-actions"
import { ApiKeysSection } from "./api-keys-section"
import { CitationStyleSetting } from "./citation-style-setting"
import { ConnectorsSection } from "./connectors-section"
import { DeepSearchSetting } from "./deep-search-setting"
import { NotificationSettings } from "./notification-settings"
import { StudySettings } from "./study-settings"
import { UsageSection } from "./usage-section"

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

async function ApiKeys() {
  const session = await getSession()
  if (!session) return null
  return <ApiKeysSection guest={Boolean(session.user.isAnonymous)} />
}

async function LeaveActions() {
  const session = await getSession()
  if (!session) return null
  return <AccountActions guest={Boolean(session.user.isAnonymous)} />
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
      <section id="connectors" aria-labelledby="connectors-heading" className="mt-15 scroll-mt-24">
        <h2 id="connectors-heading" className="text-micro text-saffron-spark uppercase">
          Connectors
        </h2>
        <div className="mt-4.5">
          <ConnectorsSection />
        </div>
      </section>
      <section aria-labelledby="writing-heading" className="mt-15">
        <h2 id="writing-heading" className="text-micro text-saffron-spark uppercase">
          Citations
        </h2>
        <div className="mt-4.5">
          <CitationStyleSetting />
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
      <section
        id="notifications"
        aria-labelledby="notifications-heading"
        className="mt-15 scroll-mt-24"
      >
        <h2 id="notifications-heading" className="text-micro text-saffron-spark uppercase">
          Notifications
        </h2>
        <div className="mt-4.5">
          <NotificationSettings />
        </div>
      </section>
      <section aria-labelledby="study-heading" className="mt-15">
        <h2 id="study-heading" className="text-micro text-saffron-spark uppercase">
          Study
        </h2>
        <div className="mt-4.5">
          <StudySettings />
        </div>
      </section>
      <section aria-labelledby="memory-heading" className="mt-15">
        <h2 id="memory-heading" className="text-micro text-saffron-spark uppercase">
          Memory
        </h2>
        <Link
          href="/knows"
          className="mt-4.5 flex items-center gap-3 border-y border-border py-4 text-ui text-bone-white hover:text-silver-mist"
        >
          <span className="flex-1">
            What Konkyo knows
            <span className="mt-0.5 block text-snippet text-ash-gray">
              What you told it, read before every answer, beside where your sources agree and
              disagree. Cross out anything it has wrong.
            </span>
          </span>
          <ChevronRightIcon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
        </Link>
      </section>
      <section id="api-keys" aria-labelledby="api-keys-heading" className="mt-15 scroll-mt-24">
        <h2 id="api-keys-heading" className="text-micro text-saffron-spark uppercase">
          API keys
        </h2>
        <div className="mt-4.5">
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <ApiKeys />
          </Suspense>
        </div>
      </section>
      <section id="usage" aria-labelledby="usage-heading" className="mt-15 scroll-mt-24">
        <h2 id="usage-heading" className="text-micro text-saffron-spark uppercase">
          Usage
        </h2>
        <div className="mt-4.5">
          <UsageSection />
        </div>
      </section>
      <section aria-labelledby="leave-heading" className="mt-15">
        <h2 id="leave-heading" className="text-micro text-saffron-spark uppercase">
          Sign out and delete
        </h2>
        <div className="mt-4.5">
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <LeaveActions />
          </Suspense>
        </div>
      </section>
    </PageShell>
  )
}
