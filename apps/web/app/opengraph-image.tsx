import { APP } from "@konkyo/config"
import { ImageResponse } from "next/og"
import { Mark } from "@/components/og-mark"

export const alt = `${APP.name}: ${APP.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** The link preview (plan §8): black, the mark, the line, and what Konkyo does. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#000",
        color: "#fff",
        padding: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Mark size={52} />
        <div style={{ fontSize: 30, letterSpacing: 1, textTransform: "uppercase" }}>{APP.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{ fontSize: 20, color: "#ffb829", letterSpacing: 2, textTransform: "uppercase" }}
        >
          A research library that checks itself
        </div>
        <div style={{ fontSize: 92, lineHeight: 1.05, letterSpacing: -3, marginTop: 20 }}>
          Every answer shows its grounds.
        </div>
        <div style={{ fontSize: 28, color: "#bdbdbd", marginTop: 28, maxWidth: 900 }}>
          Answers only from your sources, every quote checked word for word.
        </div>
      </div>
    </div>,
    size,
  )
}
