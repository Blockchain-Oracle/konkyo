import { APP } from "@konkyo/config"
import { ImageResponse } from "next/og"
import { Mark } from "@/components/og-mark"
import { openShare } from "@/lib/shares"

export const alt = "A shared Konkyo folder"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** A shared folder's preview (plan §8): its name and sources, so a pasted link says what it is. */
export default async function SharedFolderImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const share = await openShare(slug).catch(() => null)
  const name = share?.name ?? "A shared folder"
  const count = share?.files.length ?? 0
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
          Shared folder
        </div>
        <div style={{ fontSize: 76, lineHeight: 1.08, letterSpacing: -2, marginTop: 20 }}>
          {name}
        </div>
        <div style={{ fontSize: 28, color: "#bdbdbd", marginTop: 28 }}>
          {count
            ? `${count} source${count === 1 ? "" : "s"}. Ask anything; every quote is checked.`
            : "Ask anything; every quote is checked."}
        </div>
      </div>
    </div>,
    size,
  )
}
