import type { Metadata } from "next"

export const metadata: Metadata = { title: "Privacy" }

const CONTACT = "abubakrjimoh16488@gmail.com"

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="text-meta text-ash-gray">Last updated 2026</p>
      <p>
        Konkyo is a research library built for the Open Agent Hackathon 2026. This page says what it
        stores, why, and who else handles it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          Your Google name, email address and profile photo, if you sign in with Google. Guests get
          a random placeholder instead.
        </li>
        <li>
          The files you upload or import, the text and passages read from them, and the search data
          (embeddings) made from that text.
        </li>
        <li>Your chats, notes, study progress and the corrections you give the assistant.</li>
        <li>If you connect Gmail, Google Drive or Notion, only the items you choose to import.</li>
      </ul>

      <h2>Why</h2>
      <p>
        Only to run Konkyo for you: to answer questions from your library and show the exact passage
        behind each answer. We don't sell your data, show ads, or use your files to train models.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>
          OpenAI, to read questions and passages and write answers (its API doesn't train on this
          data).
        </li>
        <li>ElevenLabs, to transcribe recordings you upload and to make audio briefs.</li>
        <li>Zetaris, which stores the source text used to check every quote.</li>
        <li>Composio, only if you connect Gmail, Google Drive or Notion.</li>
        <li>Google, for sign-in, and for Google Docs export if you use it.</li>
      </ul>

      <h2>Your control</h2>
      <p>
        Deleted items go to Trash for 30 days and are then removed for good. Deleting your account
        removes your files, chats, notes and everything made from them. You can forget any
        remembered correction on the Memory page.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests:{" "}
        <a className="text-saffron-spark" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
      </p>
    </>
  )
}
