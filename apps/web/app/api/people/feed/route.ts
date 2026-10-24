import { route } from "@/lib/api"
import { countsFor, followingFeed } from "@/lib/people"

/** Home's "from people you follow": what they made public lately. */
export const GET = route(async ({ userId }) => {
  const [items, counts] = await Promise.all([followingFeed(userId), countsFor(userId)])
  return { items, following: counts.following }
})
