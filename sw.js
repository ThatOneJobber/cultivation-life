/* Service worker: lets the game load offline and be installed as an app.
   Strategy: always try the network first (so edits and new versions show up straight away),
   and fall back to the last copy it saved when you are offline. */
const CACHE = "cultivation-life-cache";
const CORE = [
  "./", "index.html", "manifest.webmanifest", "css/style.css", "data/bundle.js",
  "js/util.js", "js/settings.js", "js/audio.js", "js/items.js", "js/techniques.js", "js/sects.js", "js/family.js",
  "js/karma.js", "js/achievements.js", "js/conditions.js", "js/state.js", "js/engine.js", "js/help.js", "js/ui.js", "js/main.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match("index.html")))
  );
});
