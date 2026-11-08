/*
 * Service worker do Bingo APAE 2026.
 *
 * Página (index.html): busca na rede primeiro para receber atualizações e guarda
 * uma cópia. Sem internet, ou se a rede demorar, usa a cópia guardada.
 * Demais arquivos (ícones e manifesto): usa a cópia guardada e atualiza em segundo plano.
 */
const CACHE = 'bingo-apae-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put('./index.html', response.clone());
    return response;
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT));
  try {
    return await Promise.race([network, timeout]);
  } catch {
    const cached = (await cache.match('./index.html')) || (await cache.match('./'));
    if (cached) return cached;
    return network;
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request));
});
