import { headers } from "next/headers"
import { cache } from "react"
import { auth } from "@/lib/auth"

/**
 * The real session check. proxy.ts only looks for the cookie (fast, optimistic),
 * so every page and route that touches data calls this.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }))
