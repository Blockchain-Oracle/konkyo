// Konkyo's service worker (plan F41, §8): Web Push, and an offline page when a navigation can't
// reach the server. Nothing else is cached: Konkyo reads and checks sources on the server.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

// Self-contained (no stylesheet, script or font to fetch), in Dala's colours, one way back.
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000">
<title>Offline · Konkyo</title><style>
html,body{margin:0;background:#000;color:#fff;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100svh;display:grid;place-items:center;padding:60px 24px;box-sizing:border-box}
div{width:100%;max-width:30rem}
.brand{font-size:14px;font-weight:600;letter-spacing:.35px;text-transform:uppercase}
.label{margin-top:60px;color:#ffb829;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
h1{margin:12px 0 0;font-size:36px;font-weight:400;line-height:1.2;letter-spacing:-.04em}
p.body{margin:18px 0 0;font-size:18px;font-weight:200;line-height:1.5}
button{margin-top:36px;height:36px;padding:0 20px;border:0;border-radius:9999px;background:#8052ff;color:#fff;font:inherit;font-size:14px;font-weight:500;cursor:pointer}
button:focus-visible{outline:2px solid #bdbdbd;outline-offset:2px}
</style></head><body><main><div>
<div class="brand">Konkyo</div>
<p class="label">Offline</p>
<h1>You're offline</h1>
<p class="body">Konkyo reads and checks your sources on its server, so it needs a connection. Your work is saved and will be here when you're back.</p>
<button type="button" onclick="location.reload()">Try again</button>
</div></main></body></html>`

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } }),
    ),
  )
})

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
