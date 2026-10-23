/** JSON fetch for our own API: throws an Error carrying the server's plain-language message. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}
