import { spawn } from "node:child_process"
import { INGEST } from "@konkyo/config"

function runPiped(
  command: string,
  args: string[],
  input: Uint8Array,
  timeoutMs: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs)
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk))
    child.on("error", reject)
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(new Uint8Array(Buffer.concat(out)))
      else reject(new Error(`OCR failed (${code}): ${Buffer.concat(err).toString().slice(-400)}`))
    })
    child.stdin.end(Buffer.from(input))
  })
}

let hasLocalBinary: boolean | undefined

/**
 * Adds a text layer to scanned pages with OCRmyPDF, so the normal extractor yields boxes and scans
 * highlight like any PDF. Pages that already have text are left alone (--skip-text). Uses a local
 * `ocrmypdf` when installed (the worker image), otherwise the pinned Docker image.
 */
export async function ocrPdf(pdf: Uint8Array): Promise<Uint8Array> {
  const args = ["--skip-text", "--output-type", "pdf", "-l", INGEST.ocrLanguages, "-", "-"]
  if (hasLocalBinary === undefined) {
    hasLocalBinary = await runPiped("ocrmypdf", ["--version"], new Uint8Array(), 10_000).then(
      () => true,
      () => false,
    )
  }
  return hasLocalBinary
    ? runPiped("ocrmypdf", args, pdf, INGEST.ocrTimeoutMs)
    : runPiped("docker", ["run", "--rm", "-i", INGEST.ocrImage, ...args], pdf, INGEST.ocrTimeoutMs)
}
