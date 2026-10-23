import { z } from "zod"
import { route } from "@/lib/api"
import { removeHighlight } from "@/lib/highlights"

export const DELETE = route<{ hid: string }>(async ({ userId, params }) =>
  removeHighlight(userId, z.uuid().parse(params.hid)),
)
