import { EMAIL } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { Resend } from "resend"

/**
 * Email through Resend (plan F59): codes to sign in, invites, the weekly digest out; mail to a
 * space's address in. Without RESEND_API_KEY the server says email isn't set up, and every
 * place that offers it hides the offer (emailReady).
 */
let client: Resend | undefined
function resend() {
  if (!env.RESEND_API_KEY) throw new EmailError("Email isn't set up on this server")
  client ??= new Resend(env.RESEND_API_KEY)
  return client
}

export class EmailError extends Error {
  constructor(
    message: string,
    /** Resend's own error name (e.g. daily_quota_exceeded), when it gave one. */
    readonly code?: string,
  ) {
    super(message)
    this.name = "EmailError"
  }
}

export const emailReady = () => Boolean(env.RESEND_API_KEY)
/** Where a space's mail goes: <token>@<this>. */
export const inboundDomain = () => env.INBOUND_EMAIL_DOMAIN ?? EMAIL.inboundDomain

export type Outgoing = {
  to: string
  subject: string
  html: string
  text: string
  /** The same key within a day sends once (Resend keeps keys 24 h): `<kind>/<id>`. */
  idempotencyKey?: string
  /** For Resend's dashboard: what kind of mail this was. */
  kind: "code" | "invite" | "digest" | "held"
  replyTo?: string
}

/** Sends one email. Errors come back as EmailError with Resend's reason in plain words. */
export async function sendEmail(mail: Outgoing): Promise<{ id: string }> {
  const { data, error } = await resend().emails.send(
    {
      from: env.EMAIL_FROM ?? EMAIL.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: mail.replyTo,
      tags: [{ name: "kind", value: mail.kind }],
    },
    mail.idempotencyKey ? { idempotencyKey: mail.idempotencyKey } : undefined,
  )
  if (error || !data)
    throw new EmailError(
      error?.name === "daily_quota_exceeded" || error?.name === "monthly_quota_exceeded"
        ? "Konkyo has sent all the email it can today. Try again tomorrow."
        : "That email couldn't be sent just now.",
      error?.name,
    )
  return { id: data.id }
}

// ------------------------------------------------------------------ inbound

export type ReceivedEvent = {
  emailId: string
  from: string
  to: string[]
  subject: string
}

/**
 * A webhook from Resend, checked against its signing secret (Svix headers) on the raw body.
 * Null for anything that isn't a received email; throws when the signature doesn't hold.
 */
export function verifyInbound(raw: string, headers: Headers): ReceivedEvent | null {
  if (!env.RESEND_WEBHOOK_SECRET) throw new EmailError("Inbound email isn't set up on this server")
  const event = resend().webhooks.verify({
    payload: raw,
    headers: {
      id: headers.get("svix-id") ?? "",
      timestamp: headers.get("svix-timestamp") ?? "",
      signature: headers.get("svix-signature") ?? "",
    },
    webhookSecret: env.RESEND_WEBHOOK_SECRET,
  })
  if (event.type !== "email.received") return null
  const data = event.data as {
    email_id: string
    from: string
    to?: string[]
    received_for?: string[]
    subject?: string
  }
  return {
    emailId: data.email_id,
    from: data.from,
    // the address it was delivered for, when a list or a Bcc put someone else in To
    to: [...new Set([...(data.received_for ?? []), ...(data.to ?? [])])],
    subject: data.subject ?? "",
  }
}

export type Received = {
  id: string
  from: string
  to: string[]
  subject: string
  html: string | null
  text: string | null
  /** Whether the sender's own domain vouched for it (DMARC, else SPF or DKIM): never `from` alone. */
  authenticated: boolean
  attachments: { id: string; filename: string; contentType: string; size: number }[]
}

/** "dmarc=pass" and friends, from the Authentication-Results header the receiving server adds. */
function passed(results: string, check: "dmarc" | "spf" | "dkim") {
  return new RegExp(`\\b${check}=pass\\b`, "i").test(results)
}

/** A received email in full: its body, who vouched for it, and its attachments' metadata. */
export async function receivedEmail(emailId: string): Promise<Received> {
  const { data, error } = await resend().emails.receiving.get(emailId)
  if (error || !data) throw new EmailError(`Couldn't read the email (${error?.name ?? "empty"})`)
  // Resend's docs describe `authentication`; the SDK's type doesn't have it yet.
  const auth = (data as { authentication?: Record<string, string> }).authentication
  const header = Object.entries(data.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "authentication-results",
  )?.[1]
  const authenticated = auth
    ? auth.dmarc === "pass" || auth.spf === "pass" || auth.dkim === "pass"
    : header
      ? passed(header, "dmarc") || passed(header, "spf") || passed(header, "dkim")
      : false
  return {
    id: data.id,
    from: data.from,
    to: [...new Set([...(data.received_for ?? []), ...data.to])],
    subject: data.subject,
    html: data.html,
    text: data.text,
    authenticated,
    attachments: data.attachments.map((a) => ({
      id: a.id,
      filename: a.filename ?? "attachment",
      contentType: a.content_type,
      size: a.size,
    })),
  }
}

/** One attachment's bytes, through its signed download link (valid for an hour). */
export async function attachmentBytes(emailId: string, attachmentId: string): Promise<Uint8Array> {
  const { data, error } = await resend().emails.receiving.attachments.get({
    emailId,
    id: attachmentId,
  })
  if (error || !data)
    throw new EmailError(`Couldn't read the attachment (${error?.name ?? "empty"})`)
  const res = await fetch(data.download_url, { signal: AbortSignal.timeout(EMAIL.fetchTimeoutMs) })
  if (!res.ok) throw new EmailError(`The attachment download answered ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** The bare address in "Name <address>" or a plain address, lowercased. */
export function addressOf(from: string) {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()
}
