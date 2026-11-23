// Weather and place lookups from Open-Meteo (free, no key). Only a place name or coordinates
// leave the device; nothing about the shoot itself.
import './core.js';
const C = globalThis.Core;

const getJSON = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather service said ' + r.status);
  return r.json();
};

// Town or city search → [{ name, lat, lon, tz }].
export async function findPlaces(q) {
  q = q.trim();
  if (q.length < 2) return [];
  const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=${encodeURIComponent(q)}`);
  return (j.results || []).map(r => C.normPlace({
    name: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : '', r.country_code === 'US' ? '' : r.country].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude, tz: r.timezone,
  })).filter(Boolean);
}

// This device's position, named "Current location".
export function here() {
  return new Promise((ok, bad) => {
    if (!navigator.geolocation) return bad(new Error('No location on this device'));
    navigator.geolocation.getCurrentPosition(
      pos => ok(C.normPlace({ name: 'Current location', lat: pos.coords.latitude, lon: pos.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })),
      () => bad(new Error('Location wasn\'t allowed')), { timeout: 15000, maximumAge: 600000 });
  });
}

// Daily forecast for a shoot's days that fall within the 16-day window.
export async function forecast(p, now = Date.now()) {
  const t = C.today(now);
  const last = C.addDays(t, C.FORECAST_DAYS - 1);
  const from = p.start < t ? t : p.start;
  const to = p.end > last ? last : p.end;
  if (from > to) return null;
  const pl = p.place;
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: pl.lat, longitude: pl.lon, timezone: pl.tz || 'auto', start_date: from, end_date: to,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
  });
  return { at: now, key: C.wxKey(p), days: C.parseForecast(await getJSON(url)) };
}

// Refreshes every upcoming placed shoot that needs it. Returns true if anything changed.
let busy = false;
export async function refresh(S, force = false) {
  if (busy || !navigator.onLine) return false;
  busy = true;
  let changed = false;
  try {
    for (const p of C.needsForecast(S, Date.now(), force ? 0 : undefined)) {
      try { const w = await forecast(p); if (w) { p.wx = w; changed = true; } } catch { /* offline or rate-limited; keep the old one */ }
    }
  } finally { busy = false; }
  return changed;
}
