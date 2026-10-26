/*
 * The partners doing real work in Konkyo, with their own logos, readable on black. Wordmarks stand
 * alone; marks that are only a symbol get the name beside them. Zetaris and OpenAlex ship dark
 * artwork, so they're inverted to white.
 */

type Partner = {
  id: string
  src: string
  name: string
  word: boolean
  w: number
  h: number
  invert?: boolean
}

const PARTNERS: Partner[] = [
  {
    id: "zetaris",
    src: "/logos/zetaris.svg",
    name: "Zetaris",
    word: true,
    w: 132,
    h: 37,
    invert: true,
  },
  { id: "meterless", src: "/logos/meterless.svg", name: "Meterless", word: false, w: 28, h: 28 },
  { id: "nvidia", src: "/logos/nvidia.svg", name: "NVIDIA Nemotron", word: false, w: 32, h: 32 },
  { id: "elevenlabs", src: "/logos/elevenlabs.svg", name: "ElevenLabs", word: true, w: 140, h: 18 },
  { id: "composio", src: "/logos/composio.svg", name: "Composio", word: false, w: 28, h: 28 },
  {
    id: "openalex",
    src: "/logos/openalex.png",
    name: "OpenAlex",
    word: false,
    w: 28,
    h: 26,
    invert: true,
  },
]

export function LogoRow({ href = "/docs/partners" }: { href?: string }) {
  return (
    <ul className="not-prose flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
      {PARTNERS.map((p) => (
        <li key={p.id}>
          <a
            href={`${href}${p.id === "zetaris" || p.id === "meterless" || p.id === "nvidia" ? `/${p.id}` : "/more"}`}
            className="flex items-center gap-2.5 opacity-80 transition-opacity hover:opacity-100"
          >
            {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
            <img
              src={p.src}
              alt={p.word ? p.name : ""}
              width={p.w}
              height={p.h}
              className={p.invert ? "invert" : undefined}
            />
            {p.word ? null : (
              <span className="font-display text-[17px] font-extrabold tracking-[-0.02em]">
                {p.name}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}
