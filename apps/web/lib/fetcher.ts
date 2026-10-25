/** A failed request: the server's plain-language message, and its status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/** JSON fetch for our own API: throws an ApiError carrying the server's plain-language message. */
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
    throw new ApiError(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
    )
  return body as T
}
