"use client"

import { loadSound, playUrl, primeSounds as primeInterface } from "@/lib/sounds"

export { pulse } from "@/lib/sounds"

/**
 * Study's five sounds (made with ElevenLabs Sound Effects), on the shared engine in lib/sounds.
 * They play only in Study and only while Settings → Study sounds is on.
 */
export type StudySound = "right" | "try-again" | "hint" | "round" | "streak"

const NAMES: StudySound[] = ["right", "try-again", "hint", "round", "streak"]
/** Levelled against the interface sounds (tap 0.34 … promote 0.52); try again stays soft. */
const VOLUME: Record<StudySound, number> = {
  right: 0.5,
  "try-again": 0.36,
  hint: 0.4,
  round: 0.52,
  streak: 0.55,
}

const url = (name: StudySound) => `/sounds/${name}.mp3`

/** Call from the first tap in a session: unlocks audio and starts fetching the sounds. */
export function primeSounds() {
  primeInterface()
  for (const name of NAMES) void loadSound(url(name))
}

export function playSound(name: StudySound, enabled: boolean) {
  if (enabled) playUrl(url(name), VOLUME[name])
}
