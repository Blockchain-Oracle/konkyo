import { APP } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { ImageResponse } from "next/og"
import { Mark } from "@/components/og-mark"
import { ogFonts } from "@/lib/og"
import { publicProfile } from "@/lib/profiles"

export const alt = "A person's page on Konkyo"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * Someone's page as a link preview: their face on their colour, name, @handle and bio. Looks are
 * WebP, which the image renderer can't draw, so it uses their PNG twins in /looks/og.
 */
export default async function ProfileImage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await publicProfile(handle).catch(() => null)
  const origin = env.BETTER_AUTH_URL
  const src = profile?.face.src
    ? new URL(profile.face.src.replace(/^\/looks\/(look-\d+)\.webp$/, "/looks/og/$1.png"), origin)
        .href
    : null
  const color = profile?.face.color ?? "#7853ff"
  return new ImageResponse(
    <div
      style={{
        fontFamily: "Bricolage",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 64,
        background: color,
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 300,
          height: 300,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 300,
          border: "12px solid #0b0b0e",
          background: "#0b0b0e",
          color: "#fff",
          fontSize: 140,
          fontWeight: 800,
          overflow: "hidden",
        }}
      >
        {src ? (
          // biome-ignore lint/performance/noImgElement: rendered to PNG by next/og
          <img src={src} width={276} height={276} style={{ objectFit: "cover" }} alt="" />
        ) : (
          (profile?.name ?? "?").slice(0, 1).toUpperCase()
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          padding: "44px 48px",
          borderRadius: 40,
          background: "#0b0b0e",
          color: "#fff",
          maxWidth: 640,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark size={40} />
          <div style={{ fontSize: 26, color: "#c9ff3d" }}>{`@${profile?.handle ?? handle}`}</div>
        </div>
        <div style={{ fontSize: 72, lineHeight: 1, letterSpacing: -3, fontWeight: 800 }}>
          {profile?.name ?? "Konkyo"}
        </div>
        <div style={{ fontSize: 28, lineHeight: 1.35, color: "#d6d6d6" }}>
          {profile?.bio ?? `Reads with sources on ${APP.name}: every answer shows its grounds.`}
        </div>
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  )
}
