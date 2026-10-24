import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { db, schema } from "@konkyo/db"
import { and, count, desc, eq } from "drizzle-orm"
import { LibraryError } from "./library"

const { apiKeys } = schema
const MAX_KEYS = 10

const hashOf = (key: string) => createHash("sha256").update(key).digest("hex")

/** The person's keys, newest first (never the keys themselves: only their first characters). */
export function listKeys(ownerId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.ownerId, ownerId))
    .orderBy(desc(apiKeys.createdAt))
}

/** A new key, returned this once; only its hash is stored. */
export async function createKey(ownerId: string, rawName: string) {
  const [have] = await db.select({ n: count() }).from(apiKeys).where(eq(apiKeys.ownerId, ownerId))
  if ((have?.n ?? 0) >= MAX_KEYS)
    throw new LibraryError(`You have ${MAX_KEYS} keys already. Revoke one first.`, 409)
  const key = `kk_${randomBytes(24).toString("base64url")}`
  const name = rawName.replace(/\s+/g, " ").trim().slice(0, 60) || "API key"
  const [row] = await db
    .insert(apiKeys)
    .values({ ownerId, name, prefix: key.slice(0, 9), hash: hashOf(key) })
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix })
  if (!row) throw new LibraryError("Couldn't make the key", 500)
  return { ...row, key }
}

export async function revokeKey(ownerId: string, id: string) {
  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.ownerId, ownerId)))
}

/** Whose key this request carries (`Authorization: Bearer kk_…`), or null. */
export async function ownerOfKey(request: Request): Promise<string | null> {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(kk_[\w-]{20,})$/)?.[1]
  if (!key) return null
  const [row] = await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.hash, hashOf(key)))
    .returning({ ownerId: apiKeys.ownerId })
  return row?.ownerId ?? null
}
