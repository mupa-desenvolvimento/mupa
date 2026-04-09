// Service Worker personalizado para Mupa Terminal PWA
const CACHE_NAME = 'mupa-terminal-v2';
const urlsToCache = [
  '/',
  '/terminal',
  '/diagnostic',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/favicon.ico',
  // '/Banner Manutencão.jpg' // Comentado devido a encoding
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Cache antigo removido');
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retorna resposta do cache
        if (response) {
          return response;
        }

        // Clone da requisição
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Verifica se resposta é válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone da resposta
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
          // Fallback para offline
          if (event.request.destination === 'image') {
            return new Response(
              '<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ccc"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#666">Offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        });
      })
  );
});

// Sincronização em background
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Lógica de sincronização em background
  console.log('Service Worker: Sincronização em background');
}

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação do Mupa Terminal',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Abrir App',
        icon: '/pwa-192.png'
      },
      {
        action: 'close',
        title: 'Fechar',
        icon: '/pwa-192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Mupa Terminal', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
