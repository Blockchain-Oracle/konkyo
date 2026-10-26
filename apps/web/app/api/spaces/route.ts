import { SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { FOLDER_NAME_MAX } from "@/lib/folders"
import { markOnboarded } from "@/lib/settings"
import { createSpace, listSpaces } from "@/lib/spaces"

/** Your spaces with their identity and real covers (the rail, Home, Library). */
export const GET = route(async ({ userId }) => ({ spaces: await listSpaces(userId) }))

/** Make a space: a name, its colour, wall and symbol, and the template it came from. */
export const POST = route(
  async ({ userId, body }) => {
    const space = await createSpace(userId, body)
    // A first space ends first run (F39): Home stops asking what you're here for.
    await markOnboarded(userId)
    return space
  },
  z.object({
    name: z.string().trim().min(1).max(FOLDER_NAME_MAX),
    color: z.enum(Object.keys(SPACES.colors) as [SpaceColor, ...SpaceColor[]]),
    wall: z.enum(Object.keys(SPACES.walls) as [SpaceWall, ...SpaceWall[]]),
    symbol: z.string().min(1).max(4),
    templateId: z.string().max(40),
    description: z.string().max(200).optional(),
  }),
)
