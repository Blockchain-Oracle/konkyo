import { statSync } from "node:fs"

type Entry<T> = { value: T; mtimeMs: number }

const mtime = (file: string) => {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

/**
 * A per-process cache of an engine instance that persists to one file. The web app and the
 * worker both write the same person's H-MEM and World Model (chat answers, deep-search answers),
 * so an instance is rebuilt from disk whenever the file changed since it was loaded; otherwise
 * one process would save its stale copy over the other's writes.
 */
export function freshCache<T>(name: string) {
  const store = globalThis as typeof globalThis & Record<string, Map<string, Entry<T>> | undefined>
  store[name] ??= new Map()
  const entries = store[name] as Map<string, Entry<T>>
  return (key: string, file: string, create: () => T): T => {
    const now = mtime(file)
    const hit = entries.get(key)
    if (hit && hit.mtimeMs === now) return hit.value
    const value = create()
    // Read the time after loading: a write in between is caught on the next call.
    entries.set(key, { value, mtimeMs: mtime(file) })
    return value
  }
}
