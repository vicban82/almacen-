const CACHE_NAME = 'almacen-v18';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js'
];

// Instalar y guardar en caché
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

// Interceptar peticiones (Cache falling back to network)
self.addEventListener('fetch', event => {
    // Excluir peticiones a la API de Google Apps Script
    if (event.request.url.includes('script.google.com')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
