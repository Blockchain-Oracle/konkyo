"use client"

import { RoomHeader } from "@/components/page-shell"
import { useToday } from "@/lib/use-study"
import { Games, MakePractice, SetList } from "./study-overview"
import { StudyTogether } from "./study-together"
import { TodayCard } from "./today-card"

/**
 * Study is a room (on the mint wall): today's review as a black scoreboard beside the quiz-me
 * sheet, study together (a live round to start or join), the five games as tiles in their own
 * colours, and your practice sets on paper.
 */
export function StudyRoom() {
  const { data } = useToday(true)
  const streak = data?.streak.current ?? 0
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 pb-32 md:px-8 md:pt-[92px]">
      <RoomHeader
        title="study"
        kicker={
          data ? (
            <>
              <b>{data.due}</b> due today · {streak ? `${streak}-day streak` : "no streak yet"}
            </>
          ) : (
            "study"
          )
        }
      />
      <div className="study-board">
        <div className="study-area-today pt-2">
          <TodayCard variant="study" pinned />
        </div>
        <div className="study-area-quiz">
          <MakePractice />
        </div>
        <div className="study-area-together">
          <StudyTogether />
        </div>
        <div className="study-area-games">
          <Games />
        </div>
        <div className="study-area-sets">
          <SetList />
        </div>
      </div>
    </div>
  )
}
