const CACHE_NAME = 'driftline-performance-v14';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=14',
  './intro-stability.css?v=14',
  './v14-performance.css?v=14',
  './src/physics-core.js?v=14',
  './src/v14-route.js?v=14',
  './src/sand-effects.js?v=14',
  './src/v14-coins.js?v=14',
  './src/score-system.js?v=14',
  './src/autopilot.js?v=14',
  './src/game-ui.js?v=14',
  './src/audio-guard.js?v=14',
  './src/sand-renderer.js?v=14',
  './src/v14-performance.js?v=14',
  './src/intro-cinematic.js?v=14',
  './src/stable-main.js?v=14',
  './src/sw-register.js?v=14',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/ball.svg',
  './assets/coin.svg',
  './assets/background.svg'
];

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
