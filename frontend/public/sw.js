const CACHE_NAME = 'tribu-v9';
// Remembers which build the cached _next/static files belong to; never fetched.
const BUILD_KEY = '/__tribu-build';
const STATIC_ASSETS = ['/manifest.json', '/offline.html', '/icons/icon-192.png', '/icons/notification-badge-96.png'];

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

// Build files keep their hashed names forever, but every deploy adds new ones. When a
// page from a new build arrives, drop the files cached before it; the page fetches what it needs.
async function pruneOldBuild(response) {
  const buildId = /"buildId":"([^"]+)"/.exec(await response.text())?.[1];
  if (!buildId) return;
  const cache = await caches.open(CACHE_NAME);
  const known = await cache.match(BUILD_KEY);
  const knownId = known ? await known.text() : null;
  if (knownId === buildId) return;
  await cache.put(BUILD_KEY, new Response(buildId));
  if (knownId === null) return;
  const servedAt = Date.parse(response.headers.get('date'));
  const requests = await cache.keys();
  await Promise.all(requests.map(async (cachedRequest) => {
    if (!new URL(cachedRequest.url).pathname.startsWith('/_next/static/')) return;
    const cached = await cache.match(cachedRequest);
    // Files the new page already fetched while this ran stay.
    if (Date.parse(cached?.headers.get('date')) >= servedAt) return;
    await cache.delete(cachedRequest);
  }));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API answers are never cached, so they go straight to the network without the worker.
  if (url.pathname.startsWith('/api/')) return;

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
        if (request.mode === 'navigate' && response.ok && response.headers.get('content-type')?.includes('text/html')) {
          event.waitUntil(pruneOldBuild(response.clone()));
        }
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

  // Reminders carry their buttons and a token for them (Tribu 2.0, N-2).
  const actions = Array.isArray(data.actions) && data.action_token
    ? data.actions.filter((item) => item && item.action && item.title).slice(0, 2)
    : [];
  const notificationData = { url: data.url || '/', actionToken: actions.length ? data.action_token : null };
  // Buttons that open Tribu at a link instead of running in the background,
  // such as "Don't remind me" for a series, which asks which ones.
  const actionUrls = {};
  if (data.action_urls && typeof data.action_urls === 'object') {
    for (const { action } of actions) {
      const url = data.action_urls[action];
      if (typeof url === 'string' && url.startsWith('/')) actionUrls[action] = url;
    }
  }
  if (Object.keys(actionUrls).length) notificationData.actionUrls = actionUrls;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      // Android uses the alpha mask for its small monochrome notification icon.
      badge: '/icons/notification-badge-96.png',
      data: notificationData,
      actions,
    })
  );
});

// A reminder button runs without opening Tribu: done, or remind again later.
function runReminderAction(action, token) {
  return fetch('/api/notifications/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token }),
  }).catch(() => null);
}

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
  const actionToken = event.notification.data?.actionToken;
  const actionUrl = event.action ? event.notification.data?.actionUrls?.[event.action] : null;
  if (event.action && actionToken && !actionUrl) {
    event.waitUntil(runReminderAction(event.action, actionToken));
    return;
  }
  const targetUrl = actionUrl || event.notification.data?.url || '/';
  const targetView = notificationViewFromUrl(targetUrl);
  // A button's link keeps its details (which event, which occurrence) for
  // a newly opened window too.
  let openQuery = '';
  if (actionUrl) {
    try {
      const params = new URL(actionUrl, self.location.origin).searchParams;
      params.delete('view');
      const rest = params.toString();
      if (rest) openQuery = `&${rest}`;
    } catch {
      openQuery = '';
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      return self.clients.openWindow(`/?view=${encodeURIComponent(targetView)}${openQuery}`);
    })
  );
});
