import { HomeLayout } from "fumadocs-ui/layouts/home"
import { homeOptions } from "@/lib/layout.shared"

/** The docs' front page: the same bar as the docs, with their sections as links. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <HomeLayout {...homeOptions()}>{children}</HomeLayout>
}
