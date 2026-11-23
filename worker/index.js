// Slate reminder sender (Cloudflare Worker + D1).
//
// The iPad signs itself up: it POSTs its push subscription and the list of moments it wants a
// reminder, as opaque keys and times ("k3x9a:7:09:00" at 1765... ms). No titles, clients or gear
// ever come here. Once a minute the cron finds the moments that have arrived and sends that device
// one empty push; its service worker works out which shoot it was for and writes the notification.
//
//   POST /schedule     { sub, alerts: [{ k, at }] }   replaces this device's list
//   POST /unsubscribe  { endpoint }
//   POST /ping         { endpoint }                    one push now (signed-up devices only)

const SUBJECT = 'https://noahwitchell.github.io/slate/';
const LATE_OK = 30 * 60000; // a reminder missed by an outage is still sent if this recent
const MAX_ALERTS = 300;
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// ---------- push ----------

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = s => new TextEncoder().encode(s);

let keyCache = null;
async function signingKey(env) {
  if (!keyCache) {
    const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
    keyCache = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  return keyCache;
}

export async function vapidHeader(endpoint, key, publicKey, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

async function sendPush(env, sub) {
  const key = await signingKey(env);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, key, env.VAPID_PUBLIC), TTL: '3600', Urgency: 'high' },
  });
}

// ---------- sign-up ----------

const idFor = async endpoint => b64u(await crypto.subtle.digest('SHA-256', enc(endpoint)));

export function validEndpoint(e) {
  try { const u = new URL(e); return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname); } catch { return false; }
}

// Keeps well-formed future alerts only: [{ k, at }].
export function cleanAlerts(list, now = Date.now()) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  return list.filter(a => a && typeof a.k === 'string' && /^[A-Za-z0-9:_-]{3,60}$/.test(a.k) && Number.isFinite(a.at)
      && a.at > now - LATE_OK && a.at < now + 800 * 86400000 && !seen.has(a.k) && seen.add(a.k))
    .slice(0, MAX_ALERTS);
}

async function readBody(req, max = 32768) {
  const text = await req.text();
  if (text.length > max) throw new Error('too big');
  return JSON.parse(text);
}

async function schedule(env, b) {
  const sub = b && b.sub;
  if (!sub || !validEndpoint(sub.endpoint) || !sub.keys) return json({ error: 'not a push subscription' }, 400);
  const alerts = cleanAlerts(b.alerts);
  if (!alerts) return json({ error: 'alerts must be a list' }, 400);
  const id = await idFor(sub.endpoint);
  const now = Date.now();
  // Keep the "already sent" mark for moments that stay on the list, so a re-sync can't resend one.
  const { results: sentRows } = await env.DB.prepare('SELECT k FROM alerts WHERE sub_id = ?1 AND sent = 1').bind(id).all();
  const sent = new Set(sentRows.map(r => r.k));
  const stmts = [
    env.DB.prepare(`INSERT INTO subs (id, sub, created, updated) VALUES (?1, ?2, ?3, ?3)
        ON CONFLICT(id) DO UPDATE SET sub = ?2, updated = ?3`).bind(id, JSON.stringify(sub), now),
    env.DB.prepare('DELETE FROM alerts WHERE sub_id = ?1').bind(id),
    ...alerts.map(a => env.DB.prepare('INSERT INTO alerts (sub_id, k, at, sent) VALUES (?1, ?2, ?3, ?4)').bind(id, a.k, Math.round(a.at), sent.has(a.k) ? 1 : 0)),
  ];
  await env.DB.batch(stmts);
  return json({ ok: true, count: alerts.length });
}

async function unsubscribe(env, b) {
  if (!b || typeof b.endpoint !== 'string') return json({ error: 'endpoint needed' }, 400);
  const id = await idFor(b.endpoint);
  await env.DB.batch([env.DB.prepare('DELETE FROM alerts WHERE sub_id = ?1').bind(id), env.DB.prepare('DELETE FROM subs WHERE id = ?1').bind(id)]);
  return json({ ok: true });
}

async function ping(env, b) {
  if (!b || typeof b.endpoint !== 'string') return json({ error: 'endpoint needed' }, 400);
  const row = await env.DB.prepare('SELECT sub FROM subs WHERE id = ?1').bind(await idFor(b.endpoint)).first();
  if (!row) return json({ error: 'not signed up' }, 404);
  const res = await sendPush(env, JSON.parse(row.sub));
  return json({ ok: res.ok, status: res.status }, res.ok ? 200 : 502);
}

// ---------- the minute tick ----------

export async function tick(env, now = Date.now()) {
  const { results } = await env.DB.prepare(`SELECT a.sub_id, a.k, s.sub FROM alerts a JOIN subs s ON s.id = a.sub_id
      WHERE a.sent = 0 AND a.at <= ?1 AND a.at > ?2`).bind(now + 30000, now - LATE_OK).all();
  const bySub = new Map();
  for (const r of results) (bySub.get(r.sub_id) || bySub.set(r.sub_id, { sub: r.sub, keys: [] }).get(r.sub_id)).keys.push(r.k);
  let sent = 0, gone = 0;
  for (const [id, { sub, keys }] of bySub) {
    // Mark first, so a slow push service can't cause a double send on the next tick.
    await env.DB.batch(keys.map(k => env.DB.prepare('UPDATE alerts SET sent = 1 WHERE sub_id = ?1 AND k = ?2').bind(id, k)));
    try {
      const res = await sendPush(env, JSON.parse(sub)); // one push wakes the device; it shows every reminder due
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 410) {
        gone++;
        await env.DB.batch([env.DB.prepare('DELETE FROM alerts WHERE sub_id = ?1').bind(id), env.DB.prepare('DELETE FROM subs WHERE id = ?1').bind(id)]);
      } else console.log('push failed', res.status, await res.text());
    } catch (err) { console.log('push error', String(err)); }
  }
  await env.DB.prepare('DELETE FROM alerts WHERE at < ?1').bind(now - 2 * 86400000).run();
  if (sent || gone) console.log(`sent ${sent}, removed ${gone}`);
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path === '/') return new Response('Slate reminders are running.', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    let b;
    try { b = await readBody(req); } catch { return json({ error: 'bad request' }, 400); }
    if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
    if (path === '/schedule') return schedule(env, b);
    if (path === '/unsubscribe') return unsubscribe(env, b);
    if (path === '/ping') return ping(env, b);
    return json({ error: 'not found' }, 404);
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(tick(env)); },
};
