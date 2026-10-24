import { Skeleton } from "@konkyo/ui/components/skeleton"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageShell } from "@/components/page-shell"
import { YouCard } from "@/components/people/settings-card"
import { getSession } from "@/lib/session"
import { AccountActions } from "./account-actions"
import { ApiKeysSection } from "./api-keys-section"
import { CitationStyleSetting } from "./citation-style-setting"
import { ConnectorsSection } from "./connectors-section"
import { DeepSearchSetting } from "./deep-search-setting"
import { NotificationSettings } from "./notification-settings"
import { SettingsNav } from "./settings-nav"
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

/** One section on the paper: a display heading, an optional line under it, its rows. */
function Section({
  id,
  title,
  about,
  children,
}: {
  id: string
  title: string
  about?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="settings-section">
      <h2 id={`${id}-heading`}>{title}</h2>
      {about && <p className="settings-section-about">{about}</p>}
      {children}
    </section>
  )
}

/**
 * Settings (plan §16.8): a section nav beside the sections; you first, as the same card the rail
 * opens; then everything else on paper, with switches and real selects.
 */
export default function SettingsPage() {
  return (
    <PageShell title="settings" bare wide>
      <div className="settings-layout">
        <SettingsNav />
        <div className="settings-sections">
          <div id="you" className="settings-you-wrap">
            <YouCard />
          </div>
          <div className="surface-paper paper-sheet settings-paper">
            <Section id="sounds" title="sounds & voice">
              <SoundsSettings />
            </Section>
            <Section id="connectors" title="connectors">
              <ConnectorsSection />
            </Section>
            <Section id="citations" title="citations">
              <CitationStyleSetting />
            </Section>
            <Section id="deep-search" title="deep search">
              <DeepSearchSetting />
            </Section>
            <Section id="notifications" title="notifications">
              <NotificationSettings />
            </Section>
            <Section id="study" title="study">
              <StudySettings />
            </Section>
            <Section id="memory" title="memory">
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
            <Section id="api-keys" title="API keys">
              <Suspense fallback={<Skeleton className="h-24 w-full" />}>
                <ApiKeys />
              </Suspense>
            </Section>
            <Section id="usage" title="usage">
              <UsageSection />
            </Section>
            <Section id="leave" title="sign out & delete">
              <Suspense fallback={<Skeleton className="h-32 w-full" />}>
                <LeaveActions />
              </Suspense>
            </Section>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
