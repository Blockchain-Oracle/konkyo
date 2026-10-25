import { ROUTES } from "@konkyo/config"
import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Optimistic gate: no session cookie → straight to sign-in, without a database call.
 * Pages still verify the session with getSession(); a cookie alone proves nothing.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next()
  const url = new URL(ROUTES.signIn, request.url)
  url.searchParams.set("next", request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    "/home/:path*",
    "/library/:path*",
    "/spaces/:path*",
    "/chats/:path*",
    "/study/:path*",
    "/write/:path*",
    "/agents/:path*",
    "/inbox/:path*",
    "/settings/:path*",
    "/knows/:path*",
    "/people/:path*",
    "/trash/:path*",
    "/briefs/:path*",
  ],
}
