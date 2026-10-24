"use client"

import { SOUNDS, type UiSound } from "@konkyo/config"

/**
 * Konkyo's sound engine (plan §16.5). One Web Audio context, unlocked by the first tap anywhere
 * (browsers allow audio only after a gesture), buffers decoded once and played with no latency.
 * Interface sounds follow OurSpaces: soft, short, optional, `tap` by default, `place` when
 * something lands, `check` when a receipt lands, `promote` for pin, publish and day 7.
 */

let context: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
const pending = new Map<string, Promise<void>>()

function ctx() {
  if (context || typeof window === "undefined") return context
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  context = Ctx ? new Ctx() : null
  return context
}

/** Fetch and decode one sound once; a sound that won't load is simply skipped. */
export function loadSound(url: string) {
  const audio = ctx()
  if (!audio || buffers.has(url)) return Promise.resolve()
  const running = pending.get(url)
  if (running) return running
  const job = fetch(url)
    .then((res) => res.arrayBuffer())
    .then((bytes) => audio.decodeAudioData(bytes))
    .then((buffer) => void buffers.set(url, buffer))
    .catch(() => undefined)
  pending.set(url, job)
  return job
}

/** Play a decoded sound at a volume (0–1). Silent until the first tap has unlocked audio. */
export function playUrl(url: string, volume: number) {
  const audio = context
  const buffer = buffers.get(url)
  if (!audio || !buffer || audio.state !== "running") return
  const source = audio.createBufferSource()
  const gain = audio.createGain()
  gain.gain.value = volume
  source.buffer = buffer
  source.connect(gain).connect(audio.destination)
  source.start()
}

/** Call from the first tap: unlocks audio and starts fetching the interface sounds. */
export function primeSounds() {
  const audio = ctx()
  if (!audio) return
  if (audio.state === "suspended") void audio.resume()
  for (const url of Object.values(SOUNDS.files)) void loadSound(url)
}

let enabled: boolean | null = null

/** Interface sounds are on unless the person turned them off (saved per browser). */
export function interfaceSoundsOn() {
  if (enabled !== null) return enabled
  if (typeof window === "undefined") return true
  try {
    enabled = window.localStorage.getItem(SOUNDS.storageKey) !== "off"
  } catch {
    enabled = true
  }
  return enabled
}

export function setInterfaceSounds(on: boolean) {
  enabled = on
  try {
    window.localStorage.setItem(SOUNDS.storageKey, on ? "on" : "off")
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  if (on) sound("tap")
}

/** Play an interface sound if sounds are on. */
export function sound(name: UiSound) {
  if (!interfaceSoundsOn()) return
  playUrl(SOUNDS.files[name], SOUNDS.volumes[name])
}

/** A short pulse on Android (Safari on iOS has no vibration API). */
export function pulse(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return
  navigator.vibrate?.(pattern)
}
