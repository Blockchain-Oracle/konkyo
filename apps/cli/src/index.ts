/**
 * Konkyo from the terminal (plan S09): the same agents the app runs.
 *
 *   pnpm konkyo ask --sample                       replay a recorded run: no keys, no services
 *   SAMPLE_MODE=true pnpm konkyo                    the same, as the hackathon's validation runs it
 *   pnpm konkyo ask "<question>" --sample          the recorded run of that question
 *   pnpm konkyo samples                            the recorded questions
 *   pnpm konkyo ask "<question>" [--user <email>] [--folder <name>] [--compare] [--json]
 *                                                  live, with your .env, services and library
 *   pnpm konkyo seed --user <email>                a sample library to record against
 *   pnpm konkyo ask "<question>" --user <email> --folder <name> --record <name>
 *                                                  record a run into examples/<name>/
 */
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import { listExamples, pickExample } from "./examples"

const root = path.resolve(import.meta.dirname, "../../..")
process.env.KONKYO_ROOT ??= root

const USAGE = `Konkyo: answers from your sources, every quote checked.

  pnpm konkyo ask --sample                      replay a recorded run (no keys, no services)
  SAMPLE_MODE=true pnpm konkyo                  the same (SAMPLE_MODE=true makes every ask a replay)
  pnpm konkyo ask "<question>" --sample         replay the recorded run of that question
  pnpm konkyo samples                           list the recorded questions
  pnpm konkyo ask "<question>"                  ask your library (needs .env and services)
      --user <email>     whose library (needed when the database has several accounts)
      --folder <name>    only this folder
      --compare          weigh the sources against each other (the agree/disagree matrix)
      --json             print JSON instead of text
      --record <name>    save this run to examples/<name>/ for sample mode
  pnpm konkyo seed --user <email>               a sample library of openly licensed sources
`

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sample: { type: "boolean" },
    user: { type: "string" },
    folder: { type: "string" },
    compare: { type: "boolean" },
    json: { type: "boolean" },
    record: { type: "string" },
    about: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
})
/** SAMPLE_MODE=true (the hackathon's validation flow: `rm .env`, then sample mode) is --sample. */
const sample = Boolean(values.sample) || /^(1|true|yes)$/i.test(process.env.SAMPLE_MODE ?? "")
const [command = sample ? "ask" : undefined, ...words] = positionals
const question = words.join(" ").trim()

if (!command || values.help || command === "help") {
  process.stdout.write(USAGE)
  process.exit(0)
}

if (command === "samples") {
  const examples = await listExamples(root)
  if (!examples.length) fail("No recorded examples in examples/.")
  for (const [i, e] of examples.entries())
    process.stdout.write(`${i + 1}. ${e.question}\n   ${e.about ?? e.name}\n`)
  process.stdout.write(
    `\nReplay one: pnpm konkyo ask "<question>" --sample (or --sample with its number)\n`,
  )
  process.exit(0)
}

if (command === "ask" && sample) {
  // Nothing outside is reached in sample mode: no key is needed or read, and the World Model the
  // Analyst writes goes to a scratch folder, not your data.
  process.env.SKIP_ENV_VALIDATION = "1"
  process.env.NVIDIA_API_KEY = "sample-mode"
  process.env.KONKYO_WORLD_DIR = mkdtempSync(path.join(tmpdir(), "konkyo-sample-"))
  const examples = await listExamples(root)
  const example = pickExample(examples, question || undefined)
  if (!example)
    fail(
      `"${question}" isn't a recorded question. Sample mode replays recorded runs only:\n${examples
        .map((e, i) => `  ${i + 1}. ${e.question}`)
        .join("\n")}`,
    )
  const { ask } = await import("./ask")
  await ask({
    root,
    question: example.question,
    ownerId: "sample",
    scope: {},
    json: values.json,
    sample: example,
  })
  process.exit(0)
}

/** The account whose library answers: --user, KONKYO_USER, or the only signed-in account. */
async function owner(wanted = process.env.KONKYO_USER) {
  const { db, schema } = await import("@konkyo/db")
  const { eq, or } = await import("drizzle-orm")
  if (wanted) {
    const found = await db.query.user.findFirst({
      where: or(eq(schema.user.email, wanted), eq(schema.user.id, wanted)),
    })
    return found ?? fail(`No account ${wanted}.`)
  }
  const accounts = await db.query.user.findMany({ where: eq(schema.user.isAnonymous, false) })
  if (accounts.length === 1) return accounts[0] as (typeof accounts)[number]
  return fail(
    accounts.length
      ? `This database has ${accounts.length} accounts: pass --user <email>.`
      : "No accounts yet: sign in to the app once, or run pnpm konkyo seed --user <email>.",
  )
}

async function folderScope(ownerId: string, name: string) {
  const { db, schema } = await import("@konkyo/db")
  const { and, eq, ilike, isNull } = await import("drizzle-orm")
  const folder = await db.query.folders.findFirst({
    where: and(
      eq(schema.folders.ownerId, ownerId),
      ilike(schema.folders.name, name),
      isNull(schema.folders.deletedAt),
    ),
  })
  return folder ? { folderIds: [folder.id] } : fail(`No folder called "${name}".`)
}

if (command === "ask") {
  if (!question) fail('Ask something: pnpm konkyo ask "<question>"')
  const account = await owner(values.user)
  const scope = values.folder ? await folderScope(account.id, values.folder) : {}
  const { ask } = await import("./ask")
  await ask({
    root,
    question,
    ownerId: account.id,
    scope,
    folder: values.folder,
    compare: values.compare,
    json: values.json,
    record: values.record ? { name: values.record, about: values.about } : undefined,
  })
  process.exit(0)
}

if (command === "seed") {
  if (!values.user) fail("pnpm konkyo seed --user <email>")
  const { seed } = await import("./seed")
  const result = await seed(values.user as string)
  process.stdout.write(
    `Queued ${result.queued} sources for ${values.user} in "${result.folders.join('" and "')}".\nThe worker reads them (pnpm dev runs it); then ask, e.g.:\n  pnpm konkyo ask "Does a nap help motor learning?" --user ${values.user} --folder "${result.folders[0]}"\n${
      result.demoSlug
        ? `\n"${result.folders[0]}" is shared at /s/${result.demoSlug}. For the landing page's live demo, set\n  DEMO_SHARE_SLUG=${result.demoSlug}\n`
        : ""
    }`,
  )
  process.exit(0)
}

fail(USAGE)
