import "@konkyo/ui/globals.css"
import { ROUTES } from "@konkyo/config"
import { emailReady } from "@konkyo/email"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { FileDetailsSheet } from "@/components/library/file-details"
import { UploadsProvider } from "@/components/library/uploads-provider"
import { KeepDialog } from "@/components/people/keep-dialog"
import { AppDialogs } from "@/components/shell/app-dialogs"
import { CommandPalette } from "@/components/shell/command-palette"
import { LiveProvider } from "@/components/shell/live-provider"
import { PlacesBar } from "@/components/shell/places-bar"
import { Rail } from "@/components/shell/rail"
import { StatusPill } from "@/components/shell/status-pill"
import { WallBackground } from "@/components/shell/wall"
import { Workspace } from "@/components/source/workspace"
import { getMe } from "@/lib/profiles"
import { getSession } from "@/lib/session"

async function Shell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect(ROUTES.signIn)
  const me = await getMe(session.user.id)
  const shellUser = { name: me.name, isGuest: me.isGuest, face: me.face }

  // The floating chrome (plan §16.6): the rail of spaces (a bottom bar on phones), the
  // places as words top right, the dock with the orb, the live pill bottom left.
  return (
    <UploadsProvider>
      <LiveProvider>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Rail user={shellUser} />
        <PlacesBar />
        {/* Room for the rail on the left, and on phones for
          the rail as a bottom bar with the dock above it. */}
        <WallBackground>
          <div className="min-w-0 min-[801px]:pl-[112px] max-[800px]:pt-16 max-[800px]:pb-[190px]">
            <Workspace>{children}</Workspace>
          </div>
        </WallBackground>
        <StatusPill />
        <CommandPalette />
        <AppDialogs />
        <FileDetailsSheet />
        <KeepDialog email={emailReady()} />
      </LiveProvider>
    </UploadsProvider>
  )
}

/** Painted instantly (prerendered) while the session is checked. */
function ShellSkeleton() {
  return (
    <div className="min-h-svh">
      <div className="fixed inset-y-4 left-4 hidden w-[72px] flex-col items-center gap-2 rounded-card bg-rail py-3 md:flex">
        <Skeleton className="size-12 rounded-tile" />
        {Array.from({ length: 7 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative skeleton tiles
          <Skeleton key={index} className="size-11 rounded-full" />
        ))}
      </div>
    </div>
  )
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  )
}
