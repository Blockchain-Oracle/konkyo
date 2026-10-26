import { APP, EMAIL } from "@konkyo/config"

/**
 * Konkyo's emails, in the app's look as far as mail clients allow: a clean wall, the
 * message on cream paper with ink words, one lime button. Tables and inline styles because Gmail
 * and Outlook drop <style> and flexbox; the mark is the app icon PNG because Gmail drops SVG.
 * Every string a person typed (a name, a space) is escaped.
 */
export type Mail = { subject: string; html: string; text: string }

const C = {
  wall: "#f4f4f2",
  paper: "#fffaf7",
  ink: "#111114",
  soft: "#5f5055",
  rule: "#e8dfda",
  lime: "#c9ff3d",
} as const
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const MONO = "'SFMono-Regular',Menlo,Consolas,monospace"

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const button = (label: string, href: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${C.lime};color:${C.ink};font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(label)} &rarr;</a>`

/** The frame every email shares: the mark, a paper card with the message, a quiet footer. */
function frame({ preheader, body, footer }: { preheader: string; body: string; footer: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${APP.name}</title></head>
<body style="margin:0;padding:0;background:${C.wall};font-family:${FONT};color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.wall}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><a href="${APP.url}" style="text-decoration:none;color:${C.ink}"><img src="${APP.url}/apple-icon.png" width="32" height="32" alt="" style="vertical-align:middle;border-radius:8px"> <span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;vertical-align:middle">konkyo</span></a></td></tr>
<tr><td style="background:${C.paper};border:2px solid ${C.ink};border-radius:20px;padding:28px 28px 26px">${body}</td></tr>
<tr><td style="padding:18px 6px 0;color:${C.soft};font-size:12.5px;line-height:1.5">${footer}</td></tr>
</table></td></tr></table></body></html>`
}

const heading = (text: string) =>
  `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;letter-spacing:-0.5px;font-weight:800">${text}</h1>`
const para = (html: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${C.ink}">${html}</p>`

// ------------------------------------------------------------------ sign-in code

/** A sign-in code (Better Auth email OTP): the code big and plain, how long it works, who asked. */
export function codeEmail(code: string): Mail {
  const minutes = EMAIL.codeMinutes
  return {
    subject: `${code} is your ${APP.name} code`,
    text: `Your ${APP.name} code is ${code}. It works for ${minutes} minutes.\n\nIf you didn't ask for it, you can ignore this email: nobody can sign in without the code.`,
    html: frame({
      preheader: `${code} works for ${minutes} minutes.`,
      body: `${heading("Your code")}${para(`Enter it where you asked for it. It works for ${minutes} minutes.`)}
<div style="margin:8px 0 6px;padding:16px 0;border-radius:14px;background:${C.wall};text-align:center;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:10px">${escapeHtml(code)}</div>`,
      footer:
        "If you didn't ask for this code, you can ignore this email: nobody can sign in without it.",
    }),
  }
}

// ------------------------------------------------------------------ invite

export function inviteEmail(input: {
  inviter: string
  space: string
  sources: number
  members: number
  url: string
}): Mail {
  const inviter = escapeHtml(input.inviter)
  const space = escapeHtml(input.space)
  const what = `${input.sources} source${input.sources === 1 ? "" : "s"} · ${input.members} ${input.members === 1 ? "person" : "people"}`
  return {
    subject: `${input.inviter} invited you to “${input.space}” on ${APP.name}`,
    text: `${input.inviter} invited you to the space “${input.space}” on ${APP.name} (${what}).\n\nJoin: ${input.url}\n\n${APP.name} answers from the space's own sources and checks every quote before you see it. No account needed to walk in.`,
    html: frame({
      preheader: `${input.inviter} invited you to ${input.space}.`,
      body: `${heading(`${inviter} invited you to “${space}”`)}${para(`A shared space on ${APP.name}: ${escapeHtml(what)}. Ask it anything; every answer quotes the passage it came from, checked word for word.`)}
<div style="margin:22px 0 4px">${button("step into the space", input.url)}</div>`,
      footer: `No account needed to walk in. You got this because ${inviter} typed your address; if it wasn't meant for you, ignore it.`,
    }),
  }
}

// ------------------------------------------------------------------ weekly digest

export type DigestSection = { title: string; lines: { text: string; href?: string }[] }

/** The opt-in Friday digest: only sections that have something, each a short list of links. */
export function digestEmail(input: {
  name: string
  week: string
  sections: DigestSection[]
  settingsUrl: string
}): Mail {
  const sections = input.sections.filter((s) => s.lines.length)
  const html = sections
    .map(
      (s) =>
        `<h2 style="margin:22px 0 8px;font-size:15px;font-weight:800">${escapeHtml(s.title)}</h2><ul style="margin:0;padding:0 0 0 18px">${s.lines
          .map(
            (l) =>
              `<li style="margin:0 0 6px;font-size:14.5px;line-height:1.45">${l.href ? `<a href="${escapeHtml(l.href)}" style="color:${C.ink}">${escapeHtml(l.text)}</a>` : escapeHtml(l.text)}</li>`,
          )
          .join("")}</ul>`,
    )
    .join(`<div style="height:1px;background:${C.rule};margin:18px 0 0"></div>`)
  const text = sections
    .map(
      (s) =>
        `${s.title}\n${s.lines.map((l) => `- ${l.text}${l.href ? ` (${l.href})` : ""}`).join("\n")}`,
    )
    .join("\n\n")
  return {
    subject: `Your week in ${APP.name}: ${input.week}`,
    text: `Hi ${input.name},\n\n${text}\n\nTurn the digest off: ${input.settingsUrl}`,
    html: frame({
      preheader: sections.map((s) => s.title).join(" · "),
      body: `${heading(`Your week, ${escapeHtml(input.name)}`)}${para(escapeHtml(input.week))}${html}
<div style="margin:24px 0 2px">${button("open konkyo", APP.url)}</div>`,
      footer: `You asked for this every Friday. <a href="${escapeHtml(input.settingsUrl)}" style="color:${C.soft}">Turn it off in settings</a>.`,
    }),
  }
}
