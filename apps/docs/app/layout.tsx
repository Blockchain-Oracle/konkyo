import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Provider } from "@/components/provider"
import "./global.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Konkyo docs", template: "%s · Konkyo docs" },
  description: "How Konkyo answers only from your sources and checks every quote.",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.className}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
