import { SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { FOLDER_NAME_MAX } from "@/lib/folders"
import { editSpace, type SpaceEdit } from "@/lib/spaces"

/** Edit a space (its name, colour, wall, symbol or line), the room header's "edit". */
export const PATCH = route<{ id: string }, SpaceEdit>(
  async ({ userId, params, body }) => editSpace(userId, params.id, body),
  z.object({
    name: z.string().trim().min(1).max(FOLDER_NAME_MAX).optional(),
    color: z.enum(Object.keys(SPACES.colors) as [SpaceColor, ...SpaceColor[]]).optional(),
    wall: z.enum(Object.keys(SPACES.walls) as [SpaceWall, ...SpaceWall[]]).optional(),
    symbol: z.string().min(1).max(4).optional(),
    description: z.string().max(200).optional(),
  }),
)
