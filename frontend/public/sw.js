const CACHE_NAME = 'tribu-v7';
const STATIC_ASSETS = ['/manifest.json', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});


function isSensitiveRuntimeRoute(url) {
  const path = url.pathname;
  if (url.search) return true;
  return (
    path === '/sw.js' ||
    path === '/display' || path.startsWith('/display/') ||
    path === '/invite' || path.startsWith('/invite/') ||
    path === '/auth' || path.startsWith('/auth/') ||
    path === '/api' || path.startsWith('/api/') ||
    path === '/dav' || path.startsWith('/dav/') ||
    path === '/ws' || path.startsWith('/ws/')
  );
}

function isLocalDevHost(url) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

function shouldRuntimeCache(request, url, response) {
  return Boolean(
    response?.ok &&
    request.method === 'GET' &&
    !isSensitiveRuntimeRoute(url)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for hashed static assets (_next/static has content hashes in filenames)
  if (url.pathname.startsWith('/_next/static/')) {
    if (isLocalDevHost(url)) {
      event.respondWith(fetch(request, { cache: 'no-store' }));
      return;
    }

    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML pages and everything else (ensures fresh content after deploys)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (shouldRuntimeCache(request, url, response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        if (isSensitiveRuntimeRoute(url)) {
          return Response.error();
        }
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/offline.html');
          }
          return cached;
        });
      })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  let data = { title: 'Tribu', body: '' };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data?.text() || '';
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

function notificationViewFromUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw || raw === '/') return 'dashboard';
  let target = '';
  try {
    target = new URL(raw, self.location.origin).pathname.replace(/^\/+/, '').split('/')[0];
  } catch {
    target = raw.replace(/^\/+/, '').split('?')[0].split('/')[0];
  }
  if (target === 'birthdays') return 'contacts';
  if (target === 'today') return 'dashboard';
  return target || 'dashboard';
}

// Notification click handler — focus existing tab or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  const targetView = notificationViewFromUrl(targetUrl);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      return self.clients.openWindow(`/?view=${encodeURIComponent(targetView)}`);
    })
  );
});
