import { Skeleton } from "@konkyo/ui/components/skeleton"
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
import { ProfileSection } from "./profile-section"
import { SettingsNav } from "./settings-nav"
import { SETTINGS_SECTIONS } from "./settings-sections"
import { SoundsSettings } from "./sounds-settings"
import { StudySettings } from "./study-settings"
import { UsageSection } from "./usage-section"

export const metadata: Metadata = { title: "Settings" }

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

/** One section, on its own sheet of paper: its picture and name, a line on it, then its rows. */
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  const section = SETTINGS_SECTIONS.find((s) => s.id === id)
  if (!section) return null
  const Icon = section.icon
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="settings-paper surface-paper paper-sheet scroll-mt-28 px-5! py-6! md:px-8! md:py-7!"
    >
      <header className="mb-5 flex items-center gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-sticker text-lime">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2
            id={`${id}-heading`}
            className="font-display text-[24px] leading-none font-extrabold tracking-[-0.03em] text-ink"
          >
            {section.label}
          </h2>
          {section.about && <p className="mt-1.5 text-snippet text-ash-gray">{section.about}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

/**
 * Settings: the sections in four groups on a sticky nav, each on its own sheet of paper, with
 * the same rows throughout: the words on the left, the control on the right.
 */
export default function SettingsPage() {
  return (
    <PageShell title="settings" bare wide>
      <div className="grid items-start gap-4 md:grid-cols-[216px_minmax(0,1fr)] md:gap-8">
        <SettingsNav />
        <div className="flex max-w-3xl min-w-0 flex-col gap-5">
          <Section id="you">
            <ProfileSection />
          </Section>
          <Section id="sounds">
            <SoundsSettings />
          </Section>
          <Section id="citations">
            <CitationStyleSetting />
          </Section>
          <Section id="deep-search">
            <DeepSearchSetting />
          </Section>
          <Section id="study">
            <StudySettings />
          </Section>
          <Section id="notifications">
            <NotificationSettings />
          </Section>
          <Section id="connectors">
            <ConnectorsSection />
          </Section>
          <Section id="memory">
            <Link href="/knows" className="setting-row setting-link">
              <span className="setting-text">
                <strong>What Konkyo knows</strong>
                <span>
                  What you told it, read before every answer, beside where your sources agree and
                  disagree. Cross out anything it has wrong.
                </span>
              </span>
              <span aria-hidden="true" className="setting-go">
                →
              </span>
            </Link>
          </Section>
          <Section id="api-keys">
            <Suspense fallback={<Skeleton className="h-24 w-full" />}>
              <ApiKeys />
            </Suspense>
          </Section>
          <Section id="usage">
            <UsageSection />
          </Section>
          <Section id="leave">
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <LeaveActions />
            </Suspense>
          </Section>
        </div>
      </div>
    </PageShell>
  )
}
