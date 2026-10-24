import { APP } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { ImageResponse } from "next/og"
import { Mark } from "@/components/og-mark"
import { publicArticle } from "@/lib/articles"

export const alt = "An article on Konkyo, every quote checked"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** An article as a link preview: its title on paper, who wrote it, and what the check found. */
export default async function ArticleImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await publicArticle(slug, null).catch(() => null)
  const face = article?.author.face.src
    ? new URL(
        article.author.face.src.replace(/^\/looks\/(look-\d+)\.webp$/, "/looks/og/$1.png"),
        env.BETTER_AUTH_URL,
      ).href
    : null
  const check = article?.check
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#fffaf7",
        color: "#111114",
        padding: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            width: 56,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            background: "#0b0b0e",
          }}
        >
          <Mark size={34} />
        </div>
        <div
          style={{ fontSize: 26, color: "#5f5055" }}
        >{`${APP.name.toLowerCase()} · article`}</div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 68,
          lineHeight: 1.05,
          letterSpacing: -2.5,
          fontWeight: 800,
          maxWidth: 1000,
        }}
      >
        {article?.title ?? "An article"}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {face ? (
            // biome-ignore lint/performance/noImgElement: rendered to PNG by next/og
            <img src={face} width={64} height={64} style={{ borderRadius: 64 }} alt="" />
          ) : null}
          <div style={{ display: "flex", fontSize: 28 }}>
            {article ? `${article.author.name} · @${article.author.handle}` : ""}
          </div>
        </div>
        {check && check.total > 0 ? (
          <div
            style={{
              display: "flex",
              borderRadius: 999,
              background: "#0b0b0e",
              color: "#c9ff3d",
              padding: "12px 24px",
              fontSize: 26,
            }}
          >
            {`✓ ${check.supported} of ${check.total} claims supported`}
          </div>
        ) : null}
      </div>
    </div>,
    size,
  )
}
