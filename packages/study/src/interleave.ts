/**
 * Mixes topics within a round: items are dealt round-robin
 * from their topic groups, largest group first, so two items in a row share a topic only when
 * nothing else is left.
 */
export function interleave<T>(items: T[], topicOf: (item: T) => string): T[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = topicOf(item).trim().toLowerCase() || "—"
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const out: T[] = []
  let previous: string | undefined
  while (out.length < items.length) {
    const ready = [...groups.entries()]
      .filter(([, list]) => list.length)
      .sort((a, b) => b[1].length - a[1].length)
    const pick = ready.find(([key]) => key !== previous) ?? ready[0]
    if (!pick) break
    out.push(pick[1].shift() as T)
    previous = pick[0]
  }
  return out
}

/** A fair shuffle (Fisher–Yates), for answer options. */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}
