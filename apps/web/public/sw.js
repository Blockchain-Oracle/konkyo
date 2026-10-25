// Konkyo's service worker (plan F41, §8): Web Push, and an offline page when a navigation can't
// reach the server. Nothing else is cached: Konkyo reads and checks sources on the server.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

// Self-contained (no stylesheet, script or font to fetch): the system page's look (black page,
// a paper sticker, a big lowercase line, one lime action) in the house's colours.
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0b0e">
<title>Offline · Konkyo</title><style>
html,body{margin:0;background:#0b0b0e;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100svh;display:flex;flex-direction:column;padding:28px clamp(20px,5vw,56px) 56px;box-sizing:border-box}
.brand{font-size:18px;font-weight:800}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px;max-width:44rem}
.sticker{align-self:flex-start;rotate:-6deg;border-radius:14px;background:#fffaf7;color:#0b0b0e;padding:8px 18px 10px;font-size:34px;font-weight:800;letter-spacing:-.03em;box-shadow:0 6px 0 rgba(255,255,255,.12)}
h1{margin:0;font-size:clamp(44px,9vw,96px);font-weight:800;line-height:.95;letter-spacing:-.045em}
p{margin:0;max-width:34rem;color:rgba(255,255,255,.72);font-size:17px;font-weight:500;line-height:1.5}
button{align-self:flex-start;margin-top:8px;min-height:52px;padding:10px 22px;border:0;border-radius:9999px;background:#c9ff3d;color:#0b0b0e;font:inherit;font-size:16px;font-weight:800;cursor:pointer}
button:focus-visible{outline:3px solid #fff;outline-offset:2px}
</style></head><body><main>
<div class="brand">konkyo</div>
<div class="body">
<span class="sticker" aria-hidden="true">offline</span>
<h1>konkyo is out of reach.</h1>
<p>Konkyo reads and checks your sources on its server, so it needs a connection. Your work is saved and will be here when you're back.</p>
<button type="button" onclick="location.reload()">try again ↻</button>
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
