'use strict';

const CACHE_PREFIX = 'driftline-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v24`;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=24',
  './src/physics-core.js?v=24',
  './src/camera-system.js?v=24',
  './src/coin-routes.js?v=24',
  './src/coin-field.js?v=24',
  './src/score-system.js?v=24',
  './src/autopilot.js?v=24',
  './src/sand-effects.js?v=24',
  './src/art.js?v=24',
  './src/game-ui.js?v=24',
  './src/sand-renderer.js?v=24',
  './src/intro-cinematic.js?v=24',
  './src/main.js?v=24',
  './src/sw-register.js?v=24',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/ball.svg',
  './assets/coin.svg',
  './assets/background.svg'
];

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response?.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return cache.match('./index.html');
    }
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.protocol.startsWith('http')) return;
  event.respondWith(networkFirst(request));
});
