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
          OpenAI, to write answers from your passages and check them, and to search the web for deep
          search (its API doesn't train on this data).
        </li>
        <li>
          NVIDIA, whose API runs the Nemotron models that plan answers, find passages and check
          what's shared, and that stand in when OpenAI can't, under NVIDIA's API terms.
        </li>
        <li>ElevenLabs, to transcribe recordings you upload and to make audio briefs.</li>
        <li>Zetaris, which stores the source text used to check every quote.</li>
        <li>Composio, only if you connect Gmail, Google Drive or Notion.</li>
        <li>OpenAlex, which receives the search terms of deep searches and topic watches.</li>
        <li>Wikipedia, which receives a deep search's topic when OpenAI's web search can't run.</li>
        <li>Google, for sign-in, and for Google Docs export if you use it.</li>
      </ul>

      <h2>Shared folders and API keys</h2>
      <p>
        If you share a folder, anyone with its link can read its files and ask about them. Their
        questions are checked by Nemotron's content-safety model first (if it can't be reached, the
        question is answered like any other, only from that folder's own sources) and answered like
        yours; we keep only a keyed hash of their network address, to limit how many questions one
        visitor can ask. Turning sharing off stops the link at once.
      </p>
      <p>
        API keys are shown once when you make them; we keep only a hash. Questions asked with a key
        are saved in your chats like any other.
      </p>

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
