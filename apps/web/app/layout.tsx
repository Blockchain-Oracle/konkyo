import { APP } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { cn } from "@konkyo/ui/lib/utils"
import type { Metadata, Viewport } from "next"
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import { Providers } from "./providers"

// The two faces (plan §16.4): Bricolage Grotesque for display (its opsz axis tightens big
// titles), IBM Plex Sans for everything you read. All OFL.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
})
const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans" })
// Monospace only for code and SQL (the Grounds receipt's "Show SQL").
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" })

export const metadata: Metadata = {
  // Absolute URLs for link previews (Open Graph images) come from the app's public address.
  metadataBase: new URL(env.BETTER_AUTH_URL),
  title: { default: APP.name, template: `%s · ${APP.name}` },
  description: APP.description,
  applicationName: APP.name,
  // Added to an iPhone's home screen it opens full screen, its status bar over the room.
  appleWebApp: { capable: true, title: APP.name, statusBarStyle: "black-translucent" },
}

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  colorScheme: "dark",
  // Draw under the notch and home indicator; the bottom bar and dock pad for the safe areas.
  viewportFit: "cover",
}

// No stylesheet here: each route group brings its own (the app's in (app), (auth), (public),
// (legal) and dev; the light marketing one in (marketing)), so the landing doesn't block on CSS
// it never uses.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("dark", display.variable, sans.variable, mono.variable)}>
      <body className="min-h-svh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
