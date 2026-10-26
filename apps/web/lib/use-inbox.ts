"use client"

import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import type { InboxItem } from "./inbox"

export const inboxKeys = {
  all: ["inbox"] as const,
  list: ["inbox", "list"] as const,
  count: ["inbox", "count"] as const,
}

export function useInbox() {
  return useQuery({
    queryKey: inboxKeys.list,
    queryFn: () => api<{ items: InboxItem[] }>("/api/inbox").then((r) => r.items),
  })
}

/** The unread count beside Inbox: checked every minute and whenever the window comes back. */
export function useUnread() {
  return useQuery({
    queryKey: inboxKeys.count,
    queryFn: () => api<{ unread: number }>("/api/inbox/count").then((r) => r.unread),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

/** Web Push for this browser: permission is asked only when the person turns it on. */
export async function pushState(): Promise<"unsupported" | "denied" | "on" | "off"> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    return "unsupported"
  if (Notification.permission === "denied") return "denied"
  const registration = await navigator.serviceWorker.getRegistration("/")
  const subscription = await registration?.pushManager.getSubscription()
  return subscription ? "on" : "off"
}

const toKey = (base64: string) => {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/")
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

export async function turnOnPush() {
  const { key } = await api<{ key: string | null }>("/api/push/key")
  if (!key) throw new Error("Notifications aren't set up on this server yet")
  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("Notifications are blocked for this site")
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKey(key),
    }))
  await api("/api/push/subscribe", { method: "POST", json: subscription.toJSON() })
}

export async function turnOffPush() {
  const registration = await navigator.serviceWorker.getRegistration("/")
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await api("/api/push/subscribe", { method: "DELETE", json: { endpoint: subscription.endpoint } })
  await subscription.unsubscribe()
}
