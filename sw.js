// Salva l'app sul dispositivo, così funziona anche senza rete.
// I dati (le password) NON passano di qui: stanno cifrati nella memoria del browser.
const VERSIONE = "stralci-v4";
const FILE = [
  "./",
  "index.html",
  "css/stile.css",
  "js/cripto.js",
  "js/testo.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icona.svg",
  "icons/icona-192.png",
  "icons/icona-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
