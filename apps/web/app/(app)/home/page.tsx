import type { Metadata } from "next"
import { MobileHeader } from "@/components/page-header"
import { TodayCard } from "@/components/study/today-card"
import { HomeComposer } from "./home-composer"
import { HomeLibrary } from "./home-library"
import { HomeStart } from "./home-start"

export const metadata: Metadata = { title: "Home" }

/** Chat-first: the question box leads, then quick actions and what's new (plan F40). */
export default function HomePage() {
  return (
    <>
      <MobileHeader title="Home" />
      <div className="mx-auto w-full max-w-[44rem] px-6 pt-15 pb-24 md:pt-30">
        <HomeStart>
          <h1 className="text-subheading font-normal sm:text-heading-sm">
            What do you want to know?
          </h1>
          <HomeComposer>
            <TodayCard />
          </HomeComposer>

          <div className="mt-24">
            <HomeLibrary />
          </div>
        </HomeStart>
      </div>
    </>
  )
}
