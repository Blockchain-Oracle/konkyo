import type { schema } from "@konkyo/db"

type Problem = NonNullable<(typeof schema.files.$inferSelect)["problem"]>

/** A file that needs the person: a plain-words reason, and the fix-it action its kind brings. */
export class ProblemError extends Error {
  constructor(
    readonly problem: Problem,
    message: string,
  ) {
    super(message)
  }
}
