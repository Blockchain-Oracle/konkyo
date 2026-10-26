import { APP } from "@konkyo/config"
import type { MetadataRoute } from "next"

/** Installable app (and the only way iPhones get Web Push: Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP.name,
    short_name: APP.name,
    description: APP.description,
    start_url: "/home",
    display: "standalone",
    background_color: "#211922",
    theme_color: "#0b0b0e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
