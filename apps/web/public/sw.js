// Konkyo's service worker: Web Push only (plan F41). No offline caching here.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Konkyo", body: event.data ? event.data.text() : "" }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Konkyo", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { href: data.href || "/inbox" },
    }),
  )
})

// Tapping a notification focuses an open Konkyo window (and takes it there), or opens one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const href = new URL(event.notification.data?.href || "/inbox", self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(href)
          return w.focus()
        }
      }
      return self.clients.openWindow(href)
    }),
  )
})
