// The worker's production build: our TypeScript (the
// worker and every @konkyo package) bundled to JavaScript once, so production runs `node` on it: one
// process as PID 1, no TypeScript compiled at runtime by tsx. Every npm package stays an import,
// installed as usual. Code that finds files from its own folder (`new URL("../…", import.meta.url)`,
// `import.meta.dirname`) is re-aimed at the source file's real folder from the bundle's, so the
// migrations land where they always did. A small resolve hook adds the extension a dependency's ESM
// may leave off (what tsx forgave).
//
//   node scripts/build.mjs              build dist/bundle
//   node scripts/build.mjs --check DIR  after `pnpm deploy`: installed versions match the bundle's
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const OWN = /^@konkyo\//
/**
 * npm packages bundled with our code instead of installed: their version must be the one our code
 * resolves, and a flat production install can hoist another (Shijima, testing: zod 3 at the top
 * where the packages use zod 4).
 */
const BUNDLED = new Set(["zod"])
const OUT_DIR = here("../dist/bundle")
const RELATIVE_URL = /new URL\((["'])(\.\.?\/[^"']+)\1,\s*import\.meta\.url\)/g
const asPath = (target) => (target.startsWith(".") ? target : `./${target || "."}`)
const packageName = (spec) =>
  spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]

/** The package.json Node would load for `name` from `dir`: node_modules/<name> here or above. */
function findManifest(dir, name) {
  for (let at = dir; ; at = dirname(at)) {
    const manifest = resolve(at, "node_modules", name, "package.json")
    if (existsSync(manifest)) return manifest
    if (dirname(at) === at) return null
  }
}

const expected = new Map()

/** Bundle our own workspace code; leave every other package (and node built-ins) to runtime imports. */
const externalNpm = {
  name: "external-npm",
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) => {
      if (OWN.test(args.path) || BUNDLED.has(packageName(args.path))) return undefined
      if (!args.path.startsWith("node:") && !args.importer.includes("node_modules")) {
        const manifest = findManifest(dirname(args.importer), packageName(args.path))
        if (manifest)
          expected.set(packageName(args.path), JSON.parse(readFileSync(manifest, "utf8")).version)
      }
      return { path: args.path, external: true }
    })
  },
}

/** Each source file's own-folder lookups, rewritten to name the same place from the bundle's folder. */
const reaim = {
  name: "reaim-own-folder",
  setup(builder) {
    builder.onLoad({ filter: /\.ts$/ }, (args) => {
      if (args.path.includes("node_modules")) return undefined
      const source = readFileSync(args.path, "utf8")
      if (!source.includes("import.meta.")) return undefined
      const dir = asPath(relative(OUT_DIR, dirname(args.path)))
      const file = asPath(relative(OUT_DIR, args.path))
      const contents = source
        .replace(
          RELATIVE_URL,
          (_match, quote, rel) =>
            `new URL(${quote}${asPath(relative(OUT_DIR, resolve(dirname(args.path), rel)))}${quote}, import.meta.url)`,
        )
        .replaceAll("import.meta.dirname", `__fromBundle(${JSON.stringify(dir)})`)
        .replaceAll("import.meta.filename", `__fromBundle(${JSON.stringify(file)})`)
      return { contents, loader: "ts" }
    })
  },
}

if (process.argv[2] === "--check") {
  const installed = process.argv[3]
  const wanted = JSON.parse(readFileSync(here("../dist/bundle/externals.json"), "utf8"))
  const wrong = Object.entries(wanted).filter(([name, version]) => {
    const manifest = `${installed}/node_modules/${name}/package.json`
    return !existsSync(manifest) || JSON.parse(readFileSync(manifest, "utf8")).version !== version
  })
  if (wrong.length > 0) {
    console.error(
      `installed versions differ from the bundle's: ${wrong.map(([n, v]) => `${n}@${v}`).join(", ")}; add them to BUNDLED`,
    )
    process.exit(1)
  }
  console.log(`${Object.keys(wanted).length} external packages at the versions the bundle expects`)
  process.exit(0)
}

rmSync(here("../dist"), { recursive: true, force: true })
await build({
  entryPoints: { main: here("../src/index.ts") },
  outdir: OUT_DIR,
  // Dynamic import()s become their own chunks in Node's own module order: one-file output wraps
  // modules in lazy initialisers, and a constant read before its wrapper ran is undefined (Agari's
  // ops crash-looped on that, testing). Chunks sit beside main.mjs, so re-aimed paths hold in each.
  splitting: true,
  outExtension: { ".js": ".mjs" },
  chunkNames: "[name]-[hash]",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "warning",
  plugins: [externalNpm, reaim],
  banner: {
    js: [
      "import { createRequire as __konkyoRequire } from 'node:module';",
      "import { dirname as __konkyoDirname, resolve as __konkyoResolve } from 'node:path';",
      "import { fileURLToPath as __konkyoPath } from 'node:url';",
      "const require = __konkyoRequire(import.meta.url);",
      "const __fromBundle = (rel) => __konkyoResolve(__konkyoDirname(__konkyoPath(import.meta.url)), rel);",
    ].join(" "),
  },
})
writeFileSync(
  here("../dist/bundle/externals.json"),
  `${JSON.stringify(Object.fromEntries([...expected].sort()), null, 2)}\n`,
)
writeFileSync(
  here("../dist/bundle/resolve.mjs"),
  `export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (error) {
    const code = error && error.code
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw error
    if (specifier.startsWith("node:") || /\\.(c|m)?js$|\\.json$/.test(specifier)) throw error
    for (const suffix of [".js", "/index.js"]) {
      try {
        return await next(specifier + suffix, context)
      } catch {}
    }
    throw error
  }
}
`,
)
writeFileSync(
  here("../dist/bundle/register.mjs"),
  'import { register } from "node:module"\nregister("./resolve.mjs", import.meta.url)\n',
)
console.log("worker built: dist/bundle/main.mjs (+ register.mjs, resolve.mjs)")
