// Copies browser-side binaries we serve ourselves (no third-party CDN at runtime) into public/vendor.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const out = join(import.meta.dirname, "../public/vendor")
mkdirSync(out, { recursive: true })

const wasm = require.resolve("@embedpdf/pdfium/pdfium.wasm") // <package>/dist/pdfium.wasm
const pkg = join(dirname(wasm), "../package.json")
const { version } = JSON.parse(readFileSync(pkg, "utf8"))
copyFileSync(wasm, join(out, "pdfium.wasm"))
console.info(`[vendor] pdfium ${version}`)
