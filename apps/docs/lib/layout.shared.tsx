import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { Brand } from "@/components/brand"

/** The live app: the docs are a separate static site, so this is its one address. */
export const APP_URL = "https://konkyo.xyz"

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Brand />, url: "/" },
    themeSwitch: { enabled: false },
    links: [
      { text: "Made with", url: `${APP_URL}/made-with/zetaris`, external: true },
      { text: "Open Konkyo", url: APP_URL, external: true },
    ],
  }
}
