import { ROUTES } from "@konkyo/config"
import { SidebarInset, SidebarProvider } from "@konkyo/ui/components/sidebar"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { CommandPalette } from "@/components/shell/command-palette"
import { MobileTabBar } from "@/components/shell/mobile-tab-bar"
import { Workspace } from "@/components/source/workspace"
import { getSession } from "@/lib/session"

/** shadcn's sidebar remembers its open/closed state in this cookie. */
const SIDEBAR_COOKIE = "sidebar_state"

async function Shell({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()])
  if (!session) redirect(ROUTES.signIn)
  const { user } = session

  return (
    <SidebarProvider defaultOpen={cookieStore.get(SIDEBAR_COOKIE)?.value !== "false"}>
      <AppSidebar
        user={{
          name: user.name,
          email: user.email,
          image: user.image ?? null,
          isGuest: Boolean(user.isAnonymous),
        }}
      />
      <SidebarInset className="min-w-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Workspace>{children}</Workspace>
      </SidebarInset>
      <MobileTabBar />
      <CommandPalette />
    </SidebarProvider>
  )
}

/** Painted instantly (prerendered) while the session is checked. */
function ShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 flex-col gap-3 border-r border-border p-3 md:flex">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-9 w-full rounded-full" />
        {Array.from({ length: 7 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative skeleton rows
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1" />
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
