import type { Metadata } from "next"
import { PitchDeck } from "./PitchDeck"

export const metadata: Metadata = {
  title: "Pitch",
  description: "A short introduction to Konkyo: the problem, the product, and the live demo.",
}

export default function PitchPage() {
  return <PitchDeck />
}
