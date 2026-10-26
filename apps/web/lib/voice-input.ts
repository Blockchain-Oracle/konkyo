/**
 * The one capture behind a spoken ask (plan §16.5, "Safari/iOS double capture"): a single
 * `getUserMedia` stream feeds both the analyser the orb and waveform read and the worklet that
 * turns it into 16 kHz PCM for Scribe. Never two captures of the same mic.
 *
 * A clip can stand in for the mic: an example ask ("tap one to hear it said") plays a real voice
 * through the same analyser, so the orb and waveform move to it; `?voiceAudio=<url>` (dev) also
 * sends it to Scribe, which tests the real speech path in a browser with no microphone.
 */

import { SCRIBE_RATE } from "./scribe"

export type Capture = {
  /** Loudness now, 0..1 (before the orb's own easing). */
  loudness: () => number
  mute: (on: boolean) => void
  stop: () => void
  /** For a clip: resolves when it has played to the end. */
  ended: Promise<void>
}

export type CaptureSource =
  | { kind: "mic" }
  | { kind: "clip"; url: string; transcribe?: boolean; hear?: boolean }

const WORKLET = "/worklets/scribe-audio-processor.js"

function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let text = ""
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** Made in the tap itself (browsers only let a gesture start audio), then reused. */
let shared: AudioContext | null = null
export function audioContext(): AudioContext {
  if (!shared || shared.state === "closed") shared = new AudioContext()
  if (shared.state === "suspended") void shared.resume()
  return shared
}

/** The mic was refused or is missing: the stage offers typing instead. */
export class MicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MicError"
  }
}

export async function openCapture(
  source: CaptureSource,
  onChunk?: (base64: string) => void,
): Promise<Capture> {
  const ctx = audioContext()
  const cleanups: Array<() => void> = []
  let node: AudioNode
  let track: MediaStreamTrack | null = null
  let ended: Promise<void> = new Promise(() => {})

  if (source.kind === "mic") {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
    } catch (error) {
      throw new MicError((error as Error).message || "no microphone")
    }
    track = stream.getAudioTracks()[0] ?? null
    node = ctx.createMediaStreamSource(stream)
    cleanups.push(() => {
      for (const t of stream.getTracks()) t.stop()
    })
  } else {
    const audio = new Audio()
    audio.crossOrigin = "anonymous"
    audio.src = source.url
    const element = ctx.createMediaElementSource(audio)
    node = element
    if (source.hear !== false) element.connect(ctx.destination)
    ended = new Promise((resolve) => {
      audio.addEventListener("ended", () => resolve(), { once: true })
      audio.addEventListener("error", () => resolve(), { once: true })
    })
    await audio.play()
    cleanups.push(() => {
      audio.pause()
      audio.removeAttribute("src")
      element.disconnect()
    })
  }

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  node.connect(analyser)
  const samples = new Float32Array(analyser.fftSize)

  if (onChunk && (source.kind === "mic" || source.transcribe)) {
    try {
      await ctx.audioWorklet.addModule(WORKLET)
      const pcm = new AudioWorkletNode(ctx, "scribeAudioProcessor")
      if (ctx.sampleRate !== SCRIBE_RATE)
        pcm.port.postMessage({
          type: "configure",
          inputSampleRate: ctx.sampleRate,
          outputSampleRate: SCRIBE_RATE,
        })
      pcm.port.onmessage = (event: MessageEvent<{ audioData: ArrayBuffer }>) =>
        onChunk(base64(event.data.audioData))
      node.connect(pcm)
      cleanups.push(() => {
        pcm.port.onmessage = null
        pcm.disconnect()
      })
    } catch (error) {
      // the mic is open but can't be heard: let it go rather than leave it on
      for (const cleanup of cleanups.splice(0)) cleanup()
      analyser.disconnect()
      node.disconnect()
      throw error
    }
  }

  let muted = false
  return {
    loudness() {
      if (muted) return 0
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      const rms = Math.sqrt(sum / samples.length)
      // The curve (lib/voice.ts): a quiet room reads as nothing, a voice fills it
      return Math.sqrt(Math.min(1, Math.max(0, rms - 0.004) * 6))
    },
    mute(on) {
      muted = on
      if (track) track.enabled = !on
    },
    stop() {
      for (const cleanup of cleanups.splice(0)) cleanup()
      analyser.disconnect()
      node.disconnect()
    },
    ended,
  }
}
