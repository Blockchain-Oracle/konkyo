import "server-only"
import { db } from "@konkyo/db"
import { deleteUserRows } from "@konkyo/db/owned"
import { enqueue } from "@konkyo/jobs"

/**
 * Delete account (plan F42), and a guest's "Sign out anyway": every row goes now; stored bytes,
 * Zetaris evidence, watch tables and memory files go in the worker's purge job.
 */
export async function deleteAccount(userId: string) {
  await enqueue("purge", await deleteUserRows(db, userId))
}
