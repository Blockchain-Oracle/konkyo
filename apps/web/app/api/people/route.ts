import { z } from "zod"
import { route } from "@/lib/api"
import { countsFor, listPeople, type PeopleTab, searchPeople } from "@/lib/people"

const tabs = z.enum(["friends", "following", "followers"])

/** Your people (F55): `?tab=friends|following|followers`, or `?q=` to find someone (⌘K). */
export const GET = route(async ({ userId, request }) => {
  const params = new URL(request.url).searchParams
  const q = params.get("q")
  if (q !== null) return { people: await searchPeople(userId, q.slice(0, 60)) }
  const tab = tabs.catch("friends").parse(params.get("tab")) as PeopleTab
  const [people, counts] = await Promise.all([listPeople(userId, tab), countsFor(userId)])
  return { tab, people, counts }
})
