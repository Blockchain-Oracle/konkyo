import "@konkyo/ui/globals.css"
import { emailReady } from "@konkyo/email"
import { KeepDialog } from "@/components/people/keep-dialog"

/** The app's stylesheet for these pages (the root layout has none: see app/layout.tsx). */
export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      {/* a guest liking or following here keeps their account without leaving the page */}
      <KeepDialog email={emailReady()} />
    </>
  )
}
