import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

export const alt = "Konkyo docs: how every answer is checked against your sources"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
// Made once at build: the docs are a static export.
export const dynamic = "force-static"

const font = (weight: 600 | 800) =>
  readFile(join(process.cwd(), "assets/fonts", `bricolage-grotesque-latin-${weight}-normal.woff`))

const PAPER = "#fffaf7"
const BLACK = "#0b0b0e"
const LIME = "#c9ff3d"
const TEAL = "#13b8a6"

/** The docs' link preview, in the landing's look: black, the mark, two lines, and the path. */
export default async function OpenGraphImage() {
  const steps = ["Planner", "Retriever", "Writer", "Verifier", "Answer"]
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
        <svg viewBox="0 0 64 64" width={44} height={44} fill={LIME} aria-hidden="true">
          <rect x="4" y="15" width="56" height="9" />
          <rect x="27.5" y="3" width="9" height="57" />
          <polygon points="24,29 24,36 10,60 0,60" />
          <polygon points="40,29 40,36 54,60 64,60" />
        </svg>
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
      <div style={{ display: "flex", flexDirection: "column", fontWeight: 800 }}>
        <div style={{ fontSize: 88, lineHeight: 1, letterSpacing: -4 }}>every quote,</div>
        <div style={{ fontSize: 88, lineHeight: 1, letterSpacing: -4, color: TEAL }}>
          checked before you see it.
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {steps.map((step, i) => (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                display: "flex",
                padding: "10px 18px",
                borderRadius: 999,
                background: i === steps.length - 1 ? LIME : PAPER,
                color: BLACK,
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              {step}
            </div>
            {i < steps.length - 1 && <div style={{ fontSize: 26, color: "#a7a4a3" }}>→</div>}
          </div>
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: await font(800), weight: 800, style: "normal" },
        { name: "Bricolage", data: await font(600), weight: 600, style: "normal" },
      ],
    },
  )
}
