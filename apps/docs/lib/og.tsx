import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

export const OG_SIZE = { width: 1200, height: 630 }

const PAPER = "#fffaf7"
const BLACK = "#0b0b0e"
const LIME = "#c9ff3d"
const MUTED = "#a7a4a3"

/** Read from disk, not fetched, so the Docker build needs no network. */
const font = (weight: 600 | 800) =>
  readFile(join(process.cwd(), "assets/fonts", `bricolage-grotesque-latin-${weight}-normal.woff`))

/** The lime 木 mark, as on the landing. */
function Mark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill={LIME} aria-hidden="true">
      <rect x="4" y="15" width="56" height="9" />
      <rect x="27.5" y="3" width="9" height="57" />
      <polygon points="24,29 24,36 10,60 0,60" />
      <polygon points="40,29 40,36 54,60 64,60" />
    </svg>
  )
}

/** A docs page's link preview: black, the mark and docs pill, the section, the title, one line. */
export async function ogImage({
  kicker,
  title,
  description,
}: {
  kicker: string
  title: string
  description?: string
}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BLACK,
        color: PAPER,
        padding: 64,
        fontFamily: "Bricolage",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Mark size={44} />
        <div style={{ fontSize: 34, fontWeight: 800 }}>konkyo</div>
        <div
          style={{
            display: "flex",
            marginLeft: 6,
            padding: "4px 14px",
            border: "2px solid rgba(255,250,247,0.3)",
            borderRadius: 999,
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          docs
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "8px 18px",
            borderRadius: 999,
            background: LIME,
            color: BLACK,
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          {kicker}
        </div>
        <div style={{ fontSize: 76, lineHeight: 1.02, letterSpacing: -3, fontWeight: 800 }}>
          {title}
        </div>
        {description ? (
          <div style={{ fontSize: 28, lineHeight: 1.3, color: MUTED, fontWeight: 600 }}>
            {description.length > 120 ? `${description.slice(0, 117)}…` : description}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 22, color: MUTED, fontWeight: 600 }}>
        every answer shows its grounds · docs.konkyo.xyz
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Bricolage", data: await font(800), weight: 800, style: "normal" },
        { name: "Bricolage", data: await font(600), weight: 600, style: "normal" },
      ],
    },
  )
}
