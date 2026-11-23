// Reminder sign-up. The device subscribes to its browser's push service and hands that address,
// plus the moments it wants a reminder (opaque keys + times), to the sender in worker/.
// Pushes carry no content: the service worker writes each reminder from the local shoots.
import './core.js';
import { SENDER, VAPID_PUBLIC } from './config.js';
const C = globalThis.Core;

export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const bytes = b64 => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(s, ch => ch.charCodeAt(0));
};
const SYNCED = 'slate.push';
const post = (path, body) => fetch(SENDER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(r => { if (!r.ok) throw new Error('reminder service said ' + r.status); return r; });
const mark = v => { try { v ? localStorage.setItem(SYNCED, v) : localStorage.removeItem(SYNCED); } catch { /* private mode */ } };
const marked = () => { try { return localStorage.getItem(SYNCED); } catch { return null; } };
const registration = () => 'serviceWorker' in navigator
  ? Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 3000))])
  : Promise.resolve(null);

// 'install' (iPad/iPhone, not on the Home Screen yet), 'unsupported', 'denied', 'off' or 'on'.
export async function status() {
  if (isIOS && !standalone) return { state: 'install' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { state: 'unsupported' };
  if (Notification.permission === 'denied') return { state: 'denied' };
  try {
    const reg = await registration();
    if (!reg) return { state: 'unsupported' };
    const sub = await reg.pushManager.getSubscription();
    return sub ? { state: 'on', synced: !!marked() } : { state: 'off' };
  } catch { return { state: 'off' }; }
}

// Sends the schedule when it changed since the last successful send; a failure retries next time.
export async function sync(state, force = false) {
  const reg = await registration();
  const sub = reg && reg.pushManager && await reg.pushManager.getSubscription();
  if (!sub) return false;
  const alerts = C.schedule(state).map(a => ({ k: a.key, at: a.at }));
  const sig = sub.endpoint + JSON.stringify(alerts);
  if (!force && marked() === sig) return true;
  mark(null);
  await post('/schedule', { sub: sub.toJSON(), alerts });
  mark(sig);
  return true;
}

export async function enable(state) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return status();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(VAPID_PUBLIC) });
  await sync(state, true);
  return status();
}

export async function disable() {
  const reg = await registration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) {
    try { await post('/unsubscribe', { endpoint: sub.endpoint }); } catch { /* it drops dead addresses itself */ }
    await sub.unsubscribe();
  }
  mark(null);
  return status();
}

// Shows a real notification for a shoot now, written by the service worker exactly as a push would.
export async function preview(pid, days, note) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: 'preview', pid, days, note });
  return true;
}

// Asks the sender to push this device right now: proves the whole path works.
export async function ping() {
  const reg = await registration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return false;
  await post('/ping', { endpoint: sub.endpoint });
  return true;
}
