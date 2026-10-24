import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { Brand } from "@/components/brand"

export function baseOptions(): BaseLayoutProps {
  return { nav: { title: <Brand /> }, themeSwitch: { enabled: false } }
}
