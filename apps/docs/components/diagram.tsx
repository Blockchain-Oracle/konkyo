/**
 * A rendered architecture diagram (the README's, from .github/diagrams), in the reader's theme:
 * the site's dark class picks the dark render. Click it for the full size.
 */
export function Diagram({
  name,
  alt,
  width,
}: {
  name: "system" | "answer"
  alt: string
  width?: number
}) {
  const style = { width: width ? `${width}px` : "100%", maxWidth: "100%" }
  return (
    <figure className="not-prose my-6 flex justify-center">
      <a href={`/diagrams/${name}-light.png`} className="dark:hidden" title="Open full size">
        <img
          src={`/diagrams/${name}-light.png`}
          alt={alt}
          style={style}
          className="rounded-xl border border-fd-border"
        />
      </a>
      <a href={`/diagrams/${name}-dark.png`} className="hidden dark:block" title="Open full size">
        <img
          src={`/diagrams/${name}-dark.png`}
          alt={alt}
          style={style}
          className="rounded-xl border border-fd-border"
        />
      </a>
    </figure>
  )
}
