"use client"

/**
 * Study's five sounds (plan §7.8), made with ElevenLabs Sound Effects. Played through Web Audio
 * once the person has tapped something (browsers allow audio only after a gesture), never
 * outside Study, and off when Settings → Study sounds is off.
 */
export type StudySound = "right" | "try-again" | "hint" | "round" | "streak"

const NAMES: StudySound[] = ["right", "try-again", "hint", "round", "streak"]

let context: AudioContext | null = null
const buffers = new Map<StudySound, AudioBuffer>()
let loading: Promise<void> | null = null

function load() {
  if (loading || typeof window === "undefined") return loading
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  context = new Ctx()
  const ctx = context
  loading = Promise.all(
    NAMES.map(async (name) => {
      try {
        const res = await fetch(`/sounds/${name}.mp3`)
        buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()))
      } catch {
        // A sound that won't load is simply skipped.
      }
    }),
  ).then(() => undefined)
  return loading
}

/** Call from the first tap in a session: unlocks audio and starts fetching the sounds. */
export function primeSounds() {
  void load()
  if (context?.state === "suspended") void context.resume()
}

export function playSound(name: StudySound, enabled: boolean) {
  if (!enabled || !context) return
  const buffer = buffers.get(name)
  if (!buffer) return
  const source = context.createBufferSource()
  const gain = context.createGain()
  gain.gain.value = name === "try-again" ? 0.5 : 0.7
  source.buffer = buffer
  source.connect(gain).connect(context.destination)
  source.start()
}

/** A short pulse on Android (Safari on iOS has no vibration API). */
export function pulse(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return
  navigator.vibrate?.(pattern)
}
