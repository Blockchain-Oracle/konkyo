/**
 * A rendered architecture diagram (the README's, from .github/diagrams), in the reader's theme:
 * the site's dark class picks the dark render. Click it for the full size.
 */
export function Diagram({
  name,
  alt,
  caption,
  width,
}: {
  name: "system" | "answer" | "journey" | "file"
  alt: string
  caption?: string
  width?: number
}) {
  const style = { width: width ? `${width}px` : "100%", maxWidth: "100%" }
  return (
    <figure className="not-prose my-8 flex flex-col items-center gap-3">
      <a href={`/diagrams/${name}-light.png`} className="dark:hidden" title="Open full size">
        {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
        <img
          src={`/diagrams/${name}-light.png`}
          alt={alt}
          style={style}
          loading="lazy"
          className="rounded-xl border border-fd-border"
        />
      </a>
      <a href={`/diagrams/${name}-dark.png`} className="hidden dark:block" title="Open full size">
        {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
        <img
          src={`/diagrams/${name}-dark.png`}
          alt={alt}
          style={style}
          loading="lazy"
          className="rounded-xl border border-fd-border"
        />
      </a>
      {caption ? (
        <figcaption className="text-center text-[13px] text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
