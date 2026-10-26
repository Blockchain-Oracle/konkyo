/**
 * ElevenLabs Scribe v2 Realtime, spoken to directly: one WebSocket, audio in as
 * base64 PCM16 chunks, partial and committed transcripts out. The protocol is the one
 * `@elevenlabs/client` 1.26.0 speaks (`dist/scribe/connection.js`); speaking it here keeps that
 * package's WebRTC stack out of the app. The token is single-use and minted by `/api/voice/token`.
 *
 * Audio sent before the socket opens is held and flushed on open, so the first words of an ask
 * (said while the token and socket are still on their way) are never lost.
 */

const URI = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
export const SCRIBE_MODEL = "scribe_v2_realtime"
export const SCRIBE_RATE = 16_000

export type ScribeEvents = {
  partial: (text: string) => void
  committed: (text: string) => void
  error: (message: string) => void
}

export type ScribeSession = {
  send: (base64: string) => void
  /** End the segment: its committed transcript arrives on `committed`. */
  commit: () => void
  close: () => void
  readonly open: boolean
  /** Closed, refused or dropped: it will never hear again. */
  readonly ended: boolean
}

/** Words Scribe should lean towards: at most 50, each at most 20 characters (its limits). */
export function keytermsFrom(texts: string[]): string[] {
  const seen = new Set<string>()
  for (const text of texts)
    for (const word of text.split(/[^\p{L}\p{N}'-]+/u)) {
      // the words a general model gets wrong: names and long technical words
      if (word.length < 5 || word.length > 20) continue
      if (!/^\p{Lu}/u.test(word) && word.length < 9) continue
      seen.add(word)
      if (seen.size >= 50) return [...seen]
    }
  return [...seen]
}

export function connectScribe(
  token: Promise<string>,
  on: ScribeEvents,
  options: { keyterms?: string[]; languageCode?: string } = {},
): ScribeSession {
  let socket: WebSocket | null = null
  let closed = false
  let ended = false
  const held: string[] = []
  const message = (audio: string, commit = false) =>
    JSON.stringify({
      message_type: "input_audio_chunk",
      audio_base_64: audio,
      commit,
      sample_rate: SCRIBE_RATE,
    })

  void token
    .then((value) => {
      if (closed) return
      const params = new URLSearchParams({
        model_id: SCRIBE_MODEL,
        token: value,
        audio_format: "pcm_16000",
        commit_strategy: "manual",
      })
      if (options.languageCode) params.set("language_code", options.languageCode)
      for (const term of options.keyterms ?? []) params.append("keyterms", term)
      const ws = new WebSocket(`${URI}?${params}`)
      socket = ws
      ws.addEventListener("open", () => {
        for (const chunk of held.splice(0)) ws.send(chunk)
      })
      ws.addEventListener("message", (event) => {
        let data: { message_type?: string; text?: string; error?: string }
        try {
          data = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (data.message_type === "partial_transcript") on.partial(data.text ?? "")
        else if (data.message_type === "committed_transcript") on.committed(data.text ?? "")
        else if (
          data.message_type &&
          /error|exceeded|throttled|limited|terms|overflow|exhausted/.test(data.message_type)
        )
          on.error(data.error ?? data.message_type)
      })
      ws.addEventListener("close", (event) => {
        ended = true
        if (!closed) on.error(`closed ${event.code}${event.reason ? `: ${event.reason}` : ""}`)
      })
    })
    .catch((error: Error) => {
      ended = true
      on.error(error.message)
    })

  return {
    send(base64) {
      if (closed) return
      const chunk = message(base64)
      if (socket?.readyState === WebSocket.OPEN) socket.send(chunk)
      // about 10 s held at most: a socket that never opens can't fill memory
      else if (held.length < 100) held.push(chunk)
    },
    commit() {
      if (closed) return
      const chunk = message("", true)
      if (socket?.readyState === WebSocket.OPEN) socket.send(chunk)
      else held.push(chunk)
    },
    close() {
      closed = true
      ended = true
      held.length = 0
      socket?.close(1000)
      socket = null
    },
    get open() {
      return !closed && socket?.readyState === WebSocket.OPEN
    },
    get ended() {
      return closed || ended
    },
  }
}
