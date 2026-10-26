import { APP } from "@konkyo/config"
import { ImageResponse } from "next/og"
import { Mark, Tick } from "@/components/og-mark"
import { OG, ogFonts } from "@/lib/og"

export const alt = `${APP.name}: ${APP.headline} ${APP.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * The link preview: the landing's black, its three lines (the last in pink), and a
 * tilted violet card with a quote on paper and its lime check.
 */
export default async function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: OG.sticker,
        color: OG.paper,
        padding: 64,
        fontFamily: "Bricolage",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark size={44} />
          <div style={{ fontSize: 34, fontWeight: 800 }}>konkyo</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontWeight: 800 }}>
          {["research agents", "that check", "every quote."].map((line, i) => (
            <div
              key={line}
              style={{
                fontSize: 92,
                lineHeight: 1,
                letterSpacing: -4,
                color: i === 2 ? OG.pink : OG.paper,
              }}
            >
              {line}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: "#b4a9b1" }}>
          every answer shows its grounds · konkyo.xyz
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 18,
          width: 330,
          height: 380,
          marginLeft: "auto",
          marginTop: 60,
          borderRadius: 32,
          background: OG.violet,
          padding: 26,
          transform: "rotate(4deg)",
        }}
      >
        <div
          style={{
            display: "flex",
            borderRadius: 18,
            background: OG.paper,
            color: OG.sticker,
            padding: "18px 20px",
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          “caffeine consumption did not improve the consolidation of face recognition memory”
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            borderRadius: 999,
            background: OG.lime,
            color: OG.sticker,
            padding: "8px 16px",
            fontSize: 22,
            fontWeight: 800,
            alignItems: "center",
            gap: 8,
          }}
        >
          <Tick size={22} color={OG.sticker} />
          found in the source
        </div>
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  )
}
