import { Button } from "@konkyo/ui/components/button"
import { FileTextIcon, FolderIcon, LinkIcon, UploadIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/empty-state"
import { MobileHeader } from "@/components/page-header"
import { HomeComposer } from "./home-composer"

export const metadata: Metadata = { title: "Home" }

const QUICK_ACTIONS = [
  { label: "Upload", icon: UploadIcon, href: "/library" },
  { label: "Chat with a file", icon: FileTextIcon, href: "/library" },
  { label: "Chat with a folder", icon: FolderIcon, href: "/library" },
] as const

/** Chat-first: the question box leads, then quick actions and what's new (plan F40). */
export default function HomePage() {
  return (
    <>
      <MobileHeader title="Home" />
      <div className="mx-auto w-full max-w-[44rem] px-6 pt-15 pb-24 md:pt-30">
        <h1 className="text-subheading font-normal sm:text-heading-sm">
          What do you want to know?
        </h1>
        <HomeComposer />

        <nav aria-label="Quick actions" className="mt-4.5 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size="sm"
              className="h-8 px-3 text-snippet text-silver-mist"
              render={<Link href={action.href} />}
              nativeButton={false}
            >
              <action.icon strokeWidth={1.5} />
              {action.label}
            </Button>
          ))}
        </nav>

        <div className="mt-24">
          <EmptyState
            label="Your library"
            title="Nothing here yet"
            description="Upload files or a whole folder, or import a paper by its DOI. Every answer will point to the exact passage it came from."
          >
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href="/library" />} nativeButton={false} variant="secondary">
                <UploadIcon strokeWidth={1.5} />
                Upload files
              </Button>
              <Button render={<Link href="/library" />} nativeButton={false} variant="ghost">
                <LinkIcon strokeWidth={1.5} />
                Import by URL or DOI
              </Button>
            </div>
          </EmptyState>
        </div>
      </div>
    </>
  )
}
