// Everything lives on the device. localStorage is the truth; a copy goes to Cache Storage
// so the service worker can read the shoots when a reminder push wakes it.
import './core.js';
const C = globalThis.Core;
const KEY = 'slate.v1';
const RESCUE = 'slate.rescue';

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return C.emptyState(); }
  if (!raw) return C.emptyState();
  try { return C.normalize(JSON.parse(raw)); }
  catch {
    // Unreadable (a bad update): set the raw text aside so the next save can't overwrite it.
    try { localStorage.setItem(RESCUE, raw); } catch { /* full */ }
    return C.emptyState();
  }
}

let timer = null;
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  clearTimeout(timer);
  timer = setTimeout(() => mirror(state), 300);
}

export async function mirror(state) {
  try {
    const c = await caches.open('slate-data');
    await c.put(new Request('state.json'), new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }));
  } catch { /* no Cache Storage (file:// or private mode) */ }
}

export function requestPersistence() { navigator.storage?.persist?.().catch(() => {}); }

// Hands a file to the share sheet where there is one, otherwise downloads it.
export async function deliverFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
