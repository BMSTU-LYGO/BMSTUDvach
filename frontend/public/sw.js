const CACHE_VERSION = 'v1'

const CACHE_NAME = `bmstudvach-${CACHE_VERSION}`
const APP_SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg']
const STATIC_PREFIX = '/assets/'
const API_PATH_MARKERS = ['/api/', '/admin/']

const supportsCaches =
  typeof self !== 'undefined' && 'caches' in self && typeof caches !== 'undefined'
const supportsClients = typeof self !== 'undefined' && 'clients' in self

function sameOrigin(url) {
  return url.origin === self.location.origin
}

function isApiRequest(url) {
  if (!sameOrigin(url)) return true
  return API_PATH_MARKERS.some((marker) => url.pathname.startsWith(marker))
}

function cacheableGet(request) {
  return (
    supportsCaches &&
    request.method === 'GET' &&
    (request.url.startsWith('http:') || request.url.startsWith('https:')) &&
    sameOrigin(new URL(request.url))
  )
}

async function openCache() {
  return caches.open(CACHE_NAME)
}

async function networkFirstShell(request) {
  const cache = await openCache()
  try {
    const response = await fetch(request)
    if (response && response.ok) await cache.put(request, response.clone())
    return response
  } catch (error) {
    const fallback =
      (await cache.match(request)) ||
      (await cache.match('/')) ||
      (await cache.match('/index.html'))
    if (fallback) return fallback
    throw error
  }
}

async function staleWhileRevalidate(request) {
  const cache = await openCache()
  const cached = await cache.match(request)

  const revalidate = fetch(request)
    .then((response) => {
      if (response && response.ok) void cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)

  if (cached) return cached
  const fresh = await revalidate
  return fresh || Response.error()
}

self.addEventListener('install', (event) => {
  if (!supportsCaches) return
  event.waitUntil(
    (async () => {
      const cache = await openCache()
      await Promise.all(
        APP_SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      )
      if ('skipWaiting' in self) await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  if (!supportsCaches) return
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      )
      if (supportsClients && 'claim' in self.clients) await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (!cacheableGet(request)) return

  const url = new URL(request.url)

  // API traffic stays network-only: offline means "no requests", never stale data.
  if (isApiRequest(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request))
    return
  }

  if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
