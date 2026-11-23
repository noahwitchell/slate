// Offline cache + reminders. A push arrives empty; this worker reads the shoots the app saved
// to Cache Storage, works out which reminders are due and writes them itself.
importScripts('js/core.js');
const CACHE = 'slate-v2';
const DATA = 'slate-data';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

// Network first so updates show up right away; the cache is the offline fallback.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { cacheName: CACHE, ignoreSearch: true })));
});

async function readJSON(name, fallback) {
  try { const c = await caches.open(DATA); const r = await c.match(new Request(name)); return r ? await r.json() : fallback; }
  catch { return fallback; }
}
async function writeJSON(name, v) {
  try { const c = await caches.open(DATA); await c.put(new Request(name), new Response(JSON.stringify(v))); } catch { /* ignore */ }
}

const show = n => self.registration.showNotification(n.title, {
  body: n.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: n.tag || 'slate', data: { url: n.url },
});

async function onPush() {
  const now = Date.now();
  const s = Core.normalize(await readJSON('state.json', null));
  const shown = await readJSON('shown.json', {});
  const due = Core.due(s, now, shown);
  for (const k of Object.keys(shown)) if (shown[k] < now - 3 * Core.DAY) delete shown[k];
  if (!due.length) return show({ ...Core.fallbackNotice(s, now), tag: 'slate-next' }); // iOS needs every push to show something
  due.forEach(d => { shown[d.key] = now; });
  await writeJSON('shown.json', shown);
  return Promise.all(due.map(d => show({ ...Core.notice(s, d.p, d.days, d.note), tag: 'slate-' + d.p.id })));
}

self.addEventListener('push', e => e.waitUntil(onPush()));

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'preview') return;
  e.waitUntil(readJSON('state.json', null).then(raw => {
    const s = Core.normalize(raw);
    const p = s.projects.find(x => x.id === e.data.pid);
    return show(p ? { ...Core.notice(s, p, e.data.days, e.data.note), tag: 'slate-' + p.id } : Core.fallbackNotice(s));
  }));
});

// Tapping a reminder opens that shoot's gear list.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async cs => {
    const c = cs[0];
    if (c) {
      c.postMessage({ type: 'open', url });
      try { await c.focus(); } catch { /* iOS may refuse; the message still lands */ }
      return;
    }
    return self.clients.openWindow(url);
  }));
});
