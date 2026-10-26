import { DocsLayout } from "fumadocs-ui/layouts/notebook"
import { baseOptions } from "@/lib/layout.shared"
import { source } from "@/lib/source"

/** The docs: a top bar with the sections as tabs (Guide, The agents, Partners, Build), a sidebar below. */
export default function Layout({ children }: { children: React.ReactNode }) {
  const { nav, ...base } = baseOptions()
  return (
    <DocsLayout
      tree={source.getPageTree()}
      tabMode="navbar"
      nav={{ ...nav, mode: "top" }}
      {...base}
    >
      {children}
    </DocsLayout>
  )
}
