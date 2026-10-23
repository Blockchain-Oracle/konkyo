"use client"

import { authClient } from "./auth-client"
import { api } from "./fetcher"

/**
 * Deletes the signed-in person and everything they made (Settings, or a guest's "Sign out
 * anyway"), then clears the now-orphaned session cookie.
 */
export async function deleteMyAccount() {
  await api("/api/account", { method: "DELETE" })
  await authClient.signOut().catch(() => undefined)
}
