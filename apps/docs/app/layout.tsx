import type { Metadata, Viewport } from "next"
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import { Provider } from "@/components/provider"
import "./global.css"

// The app's faces (plan §16.4): Bricolage Grotesque for titles, IBM Plex for reading and code.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
})
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
})
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.konkyo.xyz"),
  title: { default: "Konkyo docs", template: "%s · Konkyo docs" },
  description: "How Konkyo answers only from your sources and checks every quote.",
  openGraph: { siteName: "Konkyo docs", type: "website" },
  twitter: { card: "summary_large_image" },
}

export const viewport: Viewport = { themeColor: "#0b0b0e", colorScheme: "dark" }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${display.variable} ${sans.variable} ${mono.variable} font-sans`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
