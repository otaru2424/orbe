// Guarda la app en el celular para que abra sin internet.
const CACHE = 'orbe-v10';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/pet.js', 'js/store.js', 'js/weather.js', 'js/memory.js', 'js/brain.js', 'js/llm-worker.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('orbe-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Clima y ubicación: siempre en vivo.
  if (/open-meteo|bigdatacloud/.test(url.hostname)) return;
  // Modelos de IA: los maneja WebLLM con su propio caché.
  if (/huggingface|hf\.co|raw\.githubusercontent/.test(url.hostname)) return;

  const sameOrigin = url.origin === self.location.origin;
  const isLib = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !isLib) return;

  if (sameOrigin) {
    // Primero la red (para recibir actualizaciones), si no hay, lo guardado.
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
  } else {
    // Librería con versión fija: primero lo guardado.
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    })));
  }
});
