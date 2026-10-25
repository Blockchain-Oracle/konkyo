import { z } from "zod"
import { route } from "@/lib/api"
import { newSpaceAddress, spaceAddress } from "@/lib/inbound"

const spaceId = (params: { id: string }) => z.uuid().parse(params.id)

/** The space's email address (F59), made on first look; null when the server has no inbound. */
export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  address: await spaceAddress(userId, spaceId(params)),
}))

/** A new address; the old one stops working. Owner only. */
export const POST = route<{ id: string }>(async ({ userId, params }) => ({
  address: await newSpaceAddress(userId, spaceId(params)),
}))
