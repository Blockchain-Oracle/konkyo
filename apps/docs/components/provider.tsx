"use client"

import { RootProvider } from "fumadocs-ui/provider/next"
import type { ReactNode } from "react"
import SearchDialog from "./search"

/** Dark only, like the app; search runs in the browser over a prebuilt index. */
export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ SearchDialog }} theme={{ forcedTheme: "dark", defaultTheme: "dark" }}>
      {children}
    </RootProvider>
  )
}
