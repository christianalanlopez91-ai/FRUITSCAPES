// Fruitscape service worker — app shell offline, map tiles cached as you go.
const SHELL = 'fruitscape-shell-v4';
const TILES = 'fruitscape-tiles-v1';
const TILE_CAP = 400;

const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './icon-192.png', './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  if (keys.length > TILE_CAP) await Promise.all(keys.slice(0, keys.length - TILE_CAP).map(k => c.delete(k)));
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Map tiles: serve from cache, otherwise fetch and keep a rolling window.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok) { c.put(e.request, res.clone()); trimTiles(); }
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    }));
    return;
  }

  // Everything else: cache first, fall back to network, then update the cache.
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname === 'unpkg.com' || url.hostname.includes('fonts.'))) {
      caches.open(SHELL).then(c => c.put(e.request, res.clone()));
    }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
