import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { Games, MakePractice, SetList } from "@/components/study/study-overview"
import { TodayCard } from "@/components/study/today-card"

export const metadata: Metadata = { title: "Study" }

/** Study (plan F27–F31): today's review and streak, make practice, the games, your sets. */
export default function StudyPage() {
  return (
    <PageShell title="Study">
      <div className="space-y-15">
        <TodayCard variant="study" />
        <MakePractice />
        <Games />
        <SetList />
      </div>
    </PageShell>
  )
}
