import type { Metadata } from "next"

export const metadata: Metadata = { title: "Terms" }

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <p className="text-meta text-ash-gray">Last updated 2026</p>
      <p>
        Konkyo is a hackathon project, offered free and as it is. By using it you agree to these
        terms.
      </p>

      <h2>Your files</h2>
      <p>
        Upload only material you have the right to use. Your files stay yours; Konkyo uses them only
        to answer your questions, build your practice and check citations.
      </p>

      <h2>Answers</h2>
      <p>
        Konkyo checks every quote against its source before showing it, but answers can still be
        wrong or incomplete. Open the passage and judge for yourself before relying on it,
        especially for coursework, health, legal or financial decisions.
      </p>

      <h2>Fair use</h2>
      <p>
        There is no paywall. Usage limits keep the service fair for everyone and are shown in
        Settings → Usage. Don't misuse it, attack it, or use it to break the law.
      </p>

      <h2>Changes and availability</h2>
      <p>
        The service may change or stop at any time. If these terms change, the date above changes
        too.
      </p>
    </>
  )
}
