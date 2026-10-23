import { deleteAccount } from "@/lib/account"
import { route } from "@/lib/api"

export const DELETE = route(async ({ userId }) => deleteAccount(userId))
