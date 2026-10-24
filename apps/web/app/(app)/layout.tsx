import { ROUTES } from "@konkyo/config"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { FileDetailsSheet } from "@/components/library/file-details"
import { UploadsProvider } from "@/components/library/uploads-provider"
import { AppDialogs } from "@/components/shell/app-dialogs"
import { BottomBar } from "@/components/shell/bottom-bar"
import { CommandPalette } from "@/components/shell/command-palette"
import { Rail } from "@/components/shell/rail"
import { StatusPill } from "@/components/shell/status-pill"
import { Workspace } from "@/components/source/workspace"
import { getSession } from "@/lib/session"

async function Shell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect(ROUTES.signIn)
  const { user } = session
  const shellUser = {
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    isGuest: Boolean(user.isAnonymous),
  }

  // The floating chrome (plan §16.6): the rail on the left (desktop), the bottom bar (phones),
  // the dock inside the workspace, the live pill bottom left.
  return (
    <UploadsProvider>
      <Rail user={shellUser} />
      <div className="min-w-0 md:pl-[104px]">
        <Workspace>{children}</Workspace>
      </div>
      <BottomBar user={shellUser} />
      <StatusPill />
      <CommandPalette />
      <AppDialogs />
      <FileDetailsSheet />
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
