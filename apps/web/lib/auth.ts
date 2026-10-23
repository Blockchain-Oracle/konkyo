import { AUTH } from "@konkyo/config"
import { db } from "@konkyo/db"
import { reownUserData } from "@konkyo/db/owned"
import * as schema from "@konkyo/db/schema"
import { env } from "@konkyo/env/server"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { anonymous } from "better-auth/plugins"

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
  plugins: [
    anonymous({
      emailDomainName: AUTH.guestEmailDomain,
      // A guest who signs in with Google keeps everything: reownUserData moves their rows to
      // the Google user and then deletes the guest itself. The plugin's own cleanup is off
      // because 1.7.8 skips it for first-time Google sign-ups.
      disableDeleteAnonymousUser: true,
      onLinkAccount: ({ anonymousUser, newUser }) =>
        reownUserData(db, anonymousUser.user.id, newUser.user.id),
    }),
    nextCookies(), // must stay last
  ],
})

export type Session = typeof auth.$Infer.Session
