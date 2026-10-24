import type { Metadata } from "next"
import { StudyRoom } from "@/components/study/study-room"

export const metadata: Metadata = { title: "Study" }

/** Study (plan F27–F31): today's review and streak, quiz me, the games, your sets. */
export default function StudyPage() {
  return <StudyRoom />
}
