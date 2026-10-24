import "@konkyo/ui/globals.css"
import { APP } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { cn } from "@konkyo/ui/lib/utils"
import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import { Providers } from "./providers"

// Inter's opsz axis gives large headings its Display cut automatically (plan §7.2).
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-sans" })
// Monospace only for code and SQL (the Grounds receipt's "Show SQL").
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  // Absolute URLs for link previews (Open Graph images) come from the app's public address.
  metadataBase: new URL(env.BETTER_AUTH_URL),
  title: { default: APP.name, template: `%s · ${APP.name}` },
  description: APP.tagline,
  applicationName: APP.name,
}

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("dark", inter.variable, mono.variable)}>
      <body className="min-h-svh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
