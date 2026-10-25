import "server-only"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

/*
 * Bricolage Grotesque for the link previews (Satori takes a static TTF/OTF/WOFF, not the page's
 * WOFF2 from next/font): two weights from @fontsource (OFL), in public/fonts so the standalone
 * server finds them beside it. Read once per process.
 */
const read = (weight: 600 | 800) =>
  readFile(join(process.cwd(), "public/fonts", `bricolage-grotesque-latin-${weight}-normal.woff`))

let fonts: Promise<{ name: string; data: Buffer; weight: 600 | 800; style: "normal" }[]> | null =
  null

export function ogFonts() {
  fonts ??= Promise.all([read(800), read(600)]).then(([bold, semibold]) => [
    { name: "Bricolage", data: bold, weight: 800 as const, style: "normal" as const },
    { name: "Bricolage", data: semibold, weight: 600 as const, style: "normal" as const },
  ])
  return fonts
}

/** The house colours, for images that can't read CSS. */
export const OG = {
  sticker: "#0b0b0e",
  paper: "#fffaf7",
  lime: "#c9ff3d",
  pink: "#e9369d",
  violet: "#7853ff",
} as const
