import { moveMemory, moveWorld } from "@konkyo/agents"
import { AUTH, EMAIL } from "@konkyo/config"
import { db } from "@konkyo/db"
import { reownUserData } from "@konkyo/db/owned"
import * as schema from "@konkyo/db/schema"
import { emailReady, sendEmail } from "@konkyo/email"
import { codeEmail } from "@konkyo/email/templates"
import { env } from "@konkyo/env/server"
import { deleteObject } from "@konkyo/storage"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { anonymous, emailOTP } from "better-auth/plugins"

/** Sign-in codes sent today, in all and per network address, by this one web process. */
const codesSent = { day: "", count: 0, byAddress: new Map<string, number>() }

/** Whether one more code may go out now; counted when it may. */
function takeCodeSend(address: string) {
  const day = new Date().toISOString().slice(0, 10)
  if (codesSent.day !== day) Object.assign(codesSent, { day, count: 0, byAddress: new Map() })
  const mine = codesSent.byAddress.get(address) ?? 0
  if (codesSent.count >= EMAIL.codesPerDay || mine >= EMAIL.codesPerAddressPerDay) return false
  codesSent.count++
  codesSent.byAddress.set(address, mine + 1)
  return true
}

/**
 * Checks before a code is made (Better Auth 1.7.8 swallows errors thrown while sending, so they
 * must happen here to reach the person): codes are for signing in, email must be set up, never to
 * a guest's made-up address, and within the day's caps.
 */
const beforeCode = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/email-otp/send-verification-otp") return
  const body = (ctx.body ?? {}) as { email?: unknown; type?: unknown }
  if (body.type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Not available" })
  if (!emailReady())
    throw new APIError("SERVICE_UNAVAILABLE", { message: "Email isn't set up on this server" })
  if (
    String(body.email ?? "")
      .toLowerCase()
      .endsWith(`@${AUTH.guestEmailDomain}`)
  )
    throw new APIError("BAD_REQUEST", { message: "That's a guest address, not an email" })
  const address =
    ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ctx.headers?.get("x-real-ip") ||
    "local"
  if (!takeCodeSend(address))
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "That's all the codes for today. Use Google, or try tomorrow.",
    })
})

export const auth = betterAuth({
  appName: "Konkyo",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Sign-in asks only for name, email and photo; Drive access (drive.file: only files
      // Konkyo creates) is requested later, and only when someone exports to Google Docs.
      // Offline access keeps that export working after the first hour.
      prompt: "select_account",
      accessType: "offline",
    },
  },
  session: {
    expiresIn: AUTH.sessionExpiresInSeconds,
    updateAge: AUTH.sessionUpdateAgeSeconds,
  },
  telemetry: { enabled: false },
  hooks: { before: beforeCode },
  plugins: [
    anonymous({
      emailDomainName: AUTH.guestEmailDomain,
      // A guest who signs in with Google keeps everything: reownUserData moves their rows to
      // the Google user and then deletes the guest itself. The plugin's own cleanup is off
      // because 1.7.8 skips it for first-time Google sign-ups.
      disableDeleteAnonymousUser: true,
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const moved = await reownUserData(db, anonymousUser.user.id, newUser.user.id)
        // a guest photo the account didn't take
        await Promise.all(moved.orphans.map((key) => deleteObject(key).catch(() => undefined)))
        // Corrections memory and the World Model live on disk under the guest's id.
        await moveMemory(anonymousUser.user.id, newUser.user.id)
        await moveWorld(anonymousUser.user.id, newUser.user.id)
      },
    }),
    // Email codes: sign in, or keep a guest's library, with six digits by email. The
    // anonymous plugin links a guest who signs in this way, like Google (onLinkAccount above).
    emailOTP({
      otpLength: EMAIL.codeLength,
      expiresIn: EMAIL.codeMinutes * 60,
      allowedAttempts: EMAIL.codeAttempts,
      storeOTP: "hashed",
      // Konkyo has no passwords and never verifies an address on its own: codes are to sign in.
      // The checks happen in beforeCode, where their errors reach the person; here it only sends.
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") return
        // Not awaited (Better Auth's advice): the reply mustn't say how long sending took.
        void sendEmail({ to: email, ...codeEmail(otp), kind: "code" }).catch((error) =>
          console.error("[email] code", (error as Error).message),
        )
      },
    }),
    nextCookies(), // must stay last
  ],
})

export type Session = typeof auth.$Infer.Session
