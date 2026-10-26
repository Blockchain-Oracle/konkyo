import { cn } from "@konkyo/ui/lib/utils"

export type Vendor = "zetaris" | "meterless" | "nvidia" | "elevenlabs" | "composio" | "openalex"

/**
 * A partner's real logo, readable on black. Wordmarks stand alone; marks
 * that are only a symbol get the name beside them in Bricolage. Zetaris and OpenAlex ship dark
 * artwork, so they are inverted to white.
 */
const LOGOS: Record<
  Vendor,
  { src: string; name: string; word: boolean; width: number; height: number; invert?: boolean }
> = {
  zetaris: {
    src: "/logos/partners/zetaris.svg",
    name: "Zetaris",
    word: true,
    width: 150,
    height: 42,
    invert: true,
  },
  meterless: {
    src: "/logos/partners/meterless.svg",
    name: "Meterless",
    word: false,
    width: 34,
    height: 34,
  },
  nvidia: {
    src: "/logos/partners/nvidia.svg",
    name: "NVIDIA Nemotron",
    word: false,
    width: 38,
    height: 38,
  },
  elevenlabs: {
    src: "/logos/partners/elevenlabs.svg",
    name: "ElevenLabs",
    word: true,
    width: 160,
    height: 21,
  },
  composio: {
    src: "/logos/partners/composio.svg",
    name: "Composio",
    word: false,
    width: 34,
    height: 34,
  },
  openalex: {
    src: "/logos/partners/openalex.png",
    name: "OpenAlex",
    word: false,
    width: 34,
    height: 32,
    invert: true,
  },
}

export function VendorLogo({ vendor }: { vendor: Vendor }) {
  const logo = LOGOS[vendor]
  return (
    <span className="vendor-logo">
      <img
        src={logo.src}
        alt={logo.word ? logo.name : ""}
        width={logo.width}
        height={logo.height}
        className={cn(logo.invert && "invert")}
      />
      {!logo.word && <span className="vendor-logo-text">{logo.name}</span>}
    </span>
  )
}
