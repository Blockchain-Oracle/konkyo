/**
 * Asks a library a question from the terminal and prints every agent step, the answer, its
 * citations and the Zetaris receipt. The trace lands in logs/<runId>.jsonl.
 *
 *   pnpm --filter @konkyo/worker ask "How does sleep help memory?" --owner <email or user id>
 */
import { randomUUID } from "node:crypto"
import { answer, Tracer } from "@konkyo/agents"
import { db, schema } from "@konkyo/db"
import { eq, or } from "drizzle-orm"

const args = process.argv.slice(2)
const ownerFlag = args.indexOf("--owner")
const owner = ownerFlag >= 0 ? args[ownerFlag + 1] : undefined
const question = args.filter((_, i) => i !== ownerFlag && i !== ownerFlag + 1).join(" ")
if (!question || !owner) {
  console.error('Usage: ask "<question>" --owner <email or user id>')
  process.exit(1)
}
const [user] = await db
  .select({ id: schema.user.id })
  .from(schema.user)
  .where(or(eq(schema.user.email, owner), eq(schema.user.id, owner)))
if (!user) throw new Error(`No user ${owner}`)

const runId = randomUUID()
const tracer = new Tracer(runId)
let streamed = ""
const result = await answer({
  ownerId: user.id,
  question,
  history: [],
  scope: {},
  tracer,
  emit: (e) => {
    if (e.type === "step") console.log(`· ${e.label} [${e.state}]${e.detail ? ` ${e.detail}` : ""}`)
    else if (e.type === "text") streamed += e.delta
    else if (e.type === "revising") console.log(`  ↺ round ${e.round}: ${e.reasons.join(" | ")}`)
    else if (e.type === "not-found") console.log(`∅ not in your library (${e.reason})`)
    else if (e.type === "final") {
      console.log(`\n${e.body}\n${e.caveat ? `Caveat: ${e.caveat}\n` : ""}`)
      for (const c of e.citations)
        console.log(`[${c.n}] ${c.state} · ${c.title}${c.page ? ` p.${c.page}` : ""}: "${c.quote}"`)
    } else if (e.type === "receipt")
      console.log(
        `\nReceipt: ${e.receipt.quotes} quotes checked in Zetaris · ${e.receipt.rewritten} rewritten · ${e.receipt.dropped} dropped · verify ${e.receipt.verifyMs} ms · total ${e.receipt.totalMs} ms`,
      )
  },
})
console.log(
  `\nfirst draft streamed ${streamed.length} chars · status ${result.status} · trace ${tracer.file}`,
)
process.exit(0)
