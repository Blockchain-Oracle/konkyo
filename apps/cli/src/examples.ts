import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

/**
 * The recorded examples: each folder in examples/ holds the question (input.json),
 * what Konkyo answered (output.md), the agents' trace (trace.jsonl) and the replies from the
 * outside services that sample mode replays (tape.jsonl).
 */
export type Example = {
  name: string
  dir: string
  question: string
  folder?: string
  about?: string
  recordedAt: string
}

export const examplesDir = (root: string) => path.join(root, "examples")

export async function listExamples(root: string): Promise<Example[]> {
  const dir = examplesDir(root)
  if (!existsSync(dir)) return []
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "tape.jsonl")))
    .map((d) => d.name)
    .sort()
  return Promise.all(
    names.map(async (name) => {
      const input = JSON.parse(await readFile(path.join(dir, name, "input.json"), "utf8"))
      return { name, dir: path.join(dir, name), ...input } as Example
    }),
  )
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/** The example for a question (or a name, or a number), else the first one. */
export function pickExample(examples: Example[], wanted?: string) {
  if (!wanted) return examples[0]
  const w = plain(wanted)
  return examples.find(
    (e, i) =>
      plain(e.question) === w || e.name === wanted || e.name.startsWith(wanted) || `${i + 1}` === w,
  )
}
