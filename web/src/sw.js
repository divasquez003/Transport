// Service worker de TransPort. Al compilar, vite.config.js reemplaza la versión y la lista de archivos.
const VERSION = '__VERSION__'
const ARCHIVOS = '__ARCHIVOS__'
const CACHE_APP = `transport-app-${VERSION}`
const CACHE_DATOS = 'transport-datos'

// Instalación: guarda la aplicación completa para que abra sin conexión
self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_APP).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()))
})

// Activación: borra las versiones anteriores de la aplicación
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n.startsWith('transport-app-') && n !== CACHE_APP).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (evento) => {
  const { request } = evento
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // API: primero la red; sin conexión se muestra la última respuesta guardada
  if (url.pathname.startsWith('/api/')) {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok && respuesta.headers.get('content-type')?.includes('json')) {
            const copia = respuesta.clone()
            caches.open(CACHE_DATOS).then((cache) => cache.put(request, copia))
          }
          return respuesta
        })
        .catch(() => caches.match(request).then((guardada) => guardada ?? Response.json(
          { ok: false, mensaje: 'Sin conexión: este dato todavía no está guardado en el dispositivo' },
          { status: 503 }
        )))
    )
    return
  }

  // Páginas de la aplicación (rutas de React): siempre index.html
  if (request.mode === 'navigate') {
    evento.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }

  // Archivos (JS, CSS, íconos): primero la caché
  evento.respondWith(caches.match(request).then((guardada) => guardada ?? fetch(request)))
})

// Notificaciones push que envía la API (alertas, recordatorios)
self.addEventListener('push', (evento) => {
  const datos = evento.data?.json() ?? {}
  evento.waitUntil(
    self.registration.showNotification(datos.titulo ?? 'TransPort', {
      body: datos.mensaje ?? '',
      icon: '/img/icon-192.png',
      badge: '/img/icon-192.png',
      data: { url: datos.url ?? '/portal/alertas' }
    })
  )
})

// Al tocar la notificación se abre (o enfoca) la página relacionada
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = new URL(evento.notification.data?.url ?? '/portal', self.location.origin).href
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin)
      if (abierta) return abierta.navigate(destino).then((v) => (v ?? abierta).focus())
      return self.clients.openWindow(destino)
    })
  )
})
