#!/usr/bin/env node
/**
 * Makes Konkyo's own imagery once with OpenAI gpt-image-2 (stickers: gpt-image-1, the model
 * that returns a transparent background) (plan §16.4): the 12 "looks" a guest
 * picks on the enter card, 8 decorative stickers, and 5 landing photos. Nothing here is copied
 * from OurSpaces. Outputs are committed (apps/web/public/{looks,stickers,landing}); re-run only to
 * replace a set.
 *
 *   node --env-file=.env scripts/make-images.mjs [looks|stickers|landing ...]
 *
 * Needs OPENAI_API_KEY and cwebp (libwebp; `brew install webp`) for resizing to WebP.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const KEY = process.env.OPENAI_API_KEY
if (!KEY) throw new Error("OPENAI_API_KEY is not set")
const PUBLIC = new URL("../apps/web/public/", import.meta.url).pathname
const RAW = join(tmpdir(), "konkyo-images")
mkdirSync(RAW, { recursive: true })

const LOOK_STYLE =
  "Stylised 3D animated-film character portrait, soft clay-like render, head and shoulders, centred, " +
  "friendly expression, looking at the viewer, warm soft studio light, smooth simple shapes, " +
  "plain flat solid background in the colour given, no text, no border, no props."
const COLOURS = [
  "violet #7853ff",
  "pink #e9369d",
  "cobalt blue #3f70ff",
  "orange #ff7c42",
  "teal #13b8a6",
  "butter yellow #ffb02e",
]
const PEOPLE = [
  "a young Black woman with box braids and round glasses",
  "an older South Asian man with a grey beard and a cardigan",
  "a teenage East Asian girl with a short bob and a hoodie",
  "a young man with curly red hair and freckles",
  "a Middle Eastern woman wearing a soft-coloured hijab",
  "a Latino student with a buzz cut and headphones around the neck",
  "a non-binary person with a pastel undercut and a denim jacket",
  "a smiling older Black woman with short grey hair and earrings",
  "a young Southeast Asian man with glasses and a beanie",
  "a red panda wearing a tiny scarf",
  "a wise little owl wearing reading glasses",
  "a curious fox with a pencil behind its ear",
]

const STICKER_STYLE =
  "Die-cut vinyl sticker with a thick white border and a soft glossy finish, bold flat colours, " +
  "playful, centred, generous padding, fully transparent background, no shadow, no checkerboard, no scenery."
const STICKERS = [
  ["grounds-stamp", "a round red Japanese hanko seal stamp reading 根拠 in bold brush strokes"],
  [
    "checked",
    "a lime-green (#c9ff3d) rounded badge with a bold black check mark and the word 'checked' in chunky lowercase letters",
  ],
  ["books", "a cheerful tilted stack of three hardcover books in violet, pink and orange"],
  ["magnifier", "a chunky magnifying glass with an orange handle and a sparkle on the lens"],
  ["highlighter", "a butter-yellow highlighter pen drawing a bright yellow stroke"],
  ["lightbulb", "a glowing lightbulb with little rays, butter yellow and white"],
  ["quote", "a pink speech bubble containing big black quotation marks"],
  ["day-seven", "a flame badge with the number 7 in chunky black type, orange and lime"],
]

const PHOTO_STYLE =
  "Candid documentary photograph, natural window light, shallow depth of field, warm film colour, " +
  "real everyday setting, no text, no logos, no watermark."
const PHOTOS = [
  [
    "students",
    "a university student studying late at a cluttered desk with a laptop, highlighted printouts and sticky notes",
  ],
  [
    "writers",
    "a high-school student writing an essay in a school library, books stacked beside a laptop",
  ],
  [
    "researchers",
    "an older Black man, a university researcher with grey hair and glasses, reading printed papers with a pen in a small office, notes on a whiteboard behind",
  ],
  [
    "reading-groups",
    "four friends around a café table discussing a book, coffee cups and open notebooks, laughing",
  ],
  [
    "professionals",
    "a South Asian man in his thirties, a consultant in a sweater, reading a report on a tablet on a commuter train, morning light",
  ],
]

async function generate(prompt, { size, background = "opaque", model = "gpt-image-2" }) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      size,
      quality: "medium",
      background,
      output_format: "png",
      n: 1,
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const json = await res.json()
  return Buffer.from(json.data[0].b64_json, "base64")
}

/** Resize into a WebP with cwebp (keeps alpha). */
function toWebp(png, out, width) {
  execFileSync("cwebp", [
    "-quiet",
    "-q",
    "86",
    "-alpha_q",
    "100",
    "-resize",
    String(width),
    "0",
    png,
    "-o",
    out,
  ])
}

async function pool(items, size, run) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await run(queue.shift())
    }),
  )
}

async function looks() {
  mkdirSync(join(PUBLIC, "looks"), { recursive: true })
  await pool(
    PEOPLE.map((who, i) => ({ who, i })),
    4,
    async ({ who, i }) => {
      const name = `look-${String(i + 1).padStart(2, "0")}`
      const png = join(RAW, `${name}.png`)
      if (!existsSync(png))
        writeFileSync(
          png,
          await generate(
            `${LOOK_STYLE} Character: ${who}. Background colour: ${COLOURS[i % COLOURS.length]}.`,
            { size: "1024x1024" },
          ),
        )
      toWebp(png, join(PUBLIC, "looks", `${name}.webp`), 256)
      console.log("look", name)
    },
  )
}

async function stickers() {
  mkdirSync(join(PUBLIC, "stickers"), { recursive: true })
  await pool(STICKERS, 4, async ([name, what]) => {
    const png = join(RAW, `sticker-${name}.png`)
    if (!existsSync(png))
      writeFileSync(
        png,
        await generate(`${STICKER_STYLE} The sticker shows ${what}.`, {
          size: "1024x1024",
          background: "transparent",
          model: "gpt-image-1",
        }),
      )
    toWebp(png, join(PUBLIC, "stickers", `${name}.webp`), 320)
    console.log("sticker", name)
  })
}

async function landing() {
  mkdirSync(join(PUBLIC, "landing"), { recursive: true })
  await pool(PHOTOS, 3, async ([name, what]) => {
    const png = join(RAW, `photo-${name}.png`)
    if (!existsSync(png))
      writeFileSync(png, await generate(`${PHOTO_STYLE} Scene: ${what}.`, { size: "1536x1024" }))
    toWebp(png, join(PUBLIC, "landing", `${name}.webp`), 960)
    console.log("photo", name)
  })
}

const SETS = { looks, stickers, landing }
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SETS)
for (const set of wanted) await SETS[set]()
