import { SPACES, type SpaceWall } from "@konkyo/config"
import { colorFor } from "@konkyo/ui/lib/space"
import { ImageResponse } from "next/og"
import { Mark, Spark } from "@/components/og-mark"
import { OG, ogFonts } from "@/lib/og"
import { openShare } from "@/lib/shares"

export const alt = "A public Konkyo space"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** A public space's preview: its own wall, its name huge, what it holds on a paper slip. */
export default async function PublicSpaceImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const share = await openShare(slug).catch(() => null)
  const name = (share?.name ?? "a public space").toLowerCase()
  const count = share?.files.length ?? 0
  const color = share?.color ?? colorFor(slug)
  const wall = SPACES.walls[(share?.wall ?? SPACES.defaultWall[color]) as SpaceWall]
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: wall.bg,
        color: wall.ink,
        padding: 64,
        fontFamily: "Bricolage",
      }}
    >
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          alignItems: "center",
          gap: 10,
          borderRadius: 999,
          background: OG.sticker,
          color: "#fff",
          padding: "10px 20px",
          fontSize: 24,
          fontWeight: 800,
        }}
      >
        <Spark size={22} color={OG.lime} />
        public space · {count} source{count === 1 ? "" : "s"}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: name.length > 34 ? 84 : 112,
          fontWeight: 800,
          lineHeight: 0.98,
          letterSpacing: -4,
        }}
      >
        {name}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            borderRadius: 18,
            background: OG.paper,
            color: OG.sticker,
            padding: "14px 20px",
            fontSize: 26,
            fontWeight: 600,
            transform: "rotate(-1.5deg)",
          }}
        >
          ask anything · every quote is checked against its source
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mark size={40} fill={OG.sticker} />
          <div style={{ fontSize: 28, fontWeight: 800 }}>konkyo</div>
        </div>
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  )
}
