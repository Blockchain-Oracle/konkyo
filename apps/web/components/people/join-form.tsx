"use client"

/*
 * Ported from OurSpaces (https://github.com/thomasnguyen/ourspaces-app, src/components/JoinForm.tsx),
 * MIT licence, Copyright (c) 2026 Thomas Nguyen: email in, six digits back, inside the claim card.
 * Every line is about keeping what you already have, never about unlocking the app. Konkyo's codes
 * are Better Auth's email OTP, sent through Resend (plan F59); Google stays one tap away.
 */

import { EMAIL } from "@konkyo/config"
import { OTPField } from "@konkyo/ui/components/otp-field"
import { type FormEvent, useState } from "react"
import { authClient } from "@/lib/auth-client"
import { sound } from "@/lib/sounds"

type Stage = "email" | "code" | "done"

/** Better Auth's error codes, in the card's own words. */
function sayError(error: { code?: string; message?: string; status?: number }) {
  switch (error.code) {
    case "INVALID_OTP":
      return "That code doesn't match. Check the email and try again."
    case "OTP_EXPIRED":
      return "That code has run out. Send a new one."
    case "TOO_MANY_ATTEMPTS":
      return "Too many tries for that code. Send a new one."
    default:
      if (error.status === 429)
        return error.message || "Too many tries. Wait a minute and try again."
      return error.message || "That didn't work. Try again."
  }
}

export function JoinForm({
  title,
  reason,
  name,
  google,
  onReady,
  onJoined,
  onCancel,
}: {
  /** The kicker over the email step: "keep this" for a guest, "sign in" for a return. */
  title: string
  /** One line saying why this is worth doing, in the voice of the moment. */
  reason: string
  /** The name a new account starts with (a guest's own name comes with them anyway). */
  name?: string
  /** Google, the other way in, as the card already does it. */
  google: () => void
  /** Runs before the code is sent: a guest who keeps their library walks in first. */
  onReady?: () => Promise<unknown>
  /** Signed in: where the card goes next is the card's business. */
  onJoined: () => void
  onCancel: () => void
}) {
  const [stage, setStage] = useState<Stage>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendCode = async () => {
    const address = email.trim()
    if (!address || busy) return
    setBusy(true)
    setError(null)
    try {
      await onReady?.()
      const { error: failed } = await authClient.emailOtp.sendVerificationOtp({
        email: address,
        type: "sign-in",
      })
      if (failed) throw failed
      setCode("")
      setStage("code")
      sound("tap")
    } catch (failed) {
      setError(sayError(failed as { code?: string; message?: string; status?: number }))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value: string) => {
    if (value.length < EMAIL.codeLength || busy) return
    setBusy(true)
    setError(null)
    const { error: failed } = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp: value,
      ...(name?.trim() ? { name: name.trim() } : {}),
    })
    setBusy(false)
    if (failed) {
      setCode("")
      setError(sayError(failed))
      return
    }
    sound("place")
    setStage("done")
  }

  if (stage === "done")
    return (
      <div className="join-form is-done">
        <span className="join-stamp">you&apos;re in the book</span>
        <strong>{email.trim()}</strong>
        <span>this browser, your phone, next week: same you.</span>
        <button type="button" className="claim-done" onClick={onJoined}>
          keep going <span aria-hidden="true">→</span>
        </button>
      </div>
    )

  const onCode = stage === "code"
  return (
    <div className="join-form">
      <span className="claim-card-kicker">{onCode ? "check your email" : title}</span>
      <p className="join-form-reason">
        {onCode ? `six numbers, on their way to ${email.trim()}.` : reason}
      </p>

      {onCode ? (
        <OTPField
          length={EMAIL.codeLength}
          value={code}
          onValueChange={setCode}
          onValueComplete={(value) => void verify(value)}
          validationType="numeric"
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={busy}
          aria-label="The code from your email"
        />
      ) : (
        <input
          className="claim-name-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void sendCode()
            }
          }}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={120}
          placeholder="you@email.com"
          aria-label="Your email"
          // biome-ignore lint/a11y/noAutofocus: the step opens because you asked for it
          autoFocus
        />
      )}

      {error && (
        <span className="join-form-error" role="alert">
          {error}
        </span>
      )}

      {!onCode && (
        <button type="button" className="join-google" disabled={busy} onClick={google}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
              fill="#4285F4"
            />
            <path
              d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
              fill="#34A853"
            />
            <path d="M6.4 14a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5Z" fill="#FBBC04" />
            <path
              d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6Z"
              fill="#EA4335"
            />
          </svg>
          continue with Google
        </button>
      )}

      <button
        type="button"
        className="claim-done"
        disabled={busy || (onCode ? code.length < EMAIL.codeLength : !email.trim())}
        onClick={(event: FormEvent) => {
          event.preventDefault()
          void (onCode ? verify(code) : sendCode())
        }}
      >
        {busy
          ? onCode
            ? "letting you in…"
            : "sending…"
          : onCode
            ? "that's me →"
            : "send me a code"}
      </button>

      <button
        type="button"
        className="join-form-back"
        onClick={() => {
          setError(null)
          if (onCode) {
            setCode("")
            setStage("email")
          } else onCancel()
        }}
      >
        {onCode ? "use a different email" : "not now"}
      </button>
    </div>
  )
}
