import type { BaseLayoutProps, LinkItemType } from "fumadocs-ui/layouts/shared"
import { Brand } from "@/components/brand"
import { DOCS, SITE } from "./site"

/** The one filled action in the bar: lime with ink words, like the app's own buttons. */
const openApp: LinkItemType = {
  type: "custom",
  secondary: true,
  children: (
    <a
      href={SITE.app}
      className="inline-flex h-8 items-center rounded-full bg-lime px-3.5 text-[13px] font-semibold whitespace-nowrap text-ink transition-opacity hover:opacity-85"
    >
      Open Konkyo
    </a>
  ),
}

/** The bar on every page: the mark, the docs pill, and the app. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Brand />, url: "/" },
    themeSwitch: { enabled: false },
    links: [openApp],
  }
}

/** The front page's bar also names the docs' sections (inside the docs they're the tabs). */
export function homeOptions(): BaseLayoutProps {
  return {
    ...baseOptions(),
    links: [
      { text: "Guide", url: DOCS.guide, active: "nested-url" },
      { text: "The agents", url: DOCS.agents, active: "nested-url" },
      { text: "Partners", url: DOCS.partners, active: "nested-url" },
      { text: "Build", url: DOCS.build, active: "nested-url" },
      openApp,
    ],
  }
}
