// Slate rules: data shape, dates, reminder schedule, gear status, conflicts, notification text.
// A classic script (exposes globalThis.Core) so the page, the service worker and node tests share it.
(function (G) {
  'use strict';

  const DAY = 86400000;

  const CATEGORIES = ['Camera', 'Lens', 'Media', 'Power', 'Monitor', 'Audio', 'Lighting', 'Grip', 'Support', 'Filters', 'Computer', 'Cases', 'Other'];
  const STATUS = {
    hold: { name: 'Hold' },
    confirmed: { name: 'Confirmed' },
    wrapped: { name: 'Wrapped' },
    cancelled: { name: 'Cancelled' },
  };
  const COLORS = ['#ff8a4c', '#f2c14e', '#4fd1a1', '#47c4e6', '#6e9bff', '#b48cff', '#ff6f9f', '#c9c2b8'];
  const CONDITION = { ok: 'Good', repair: 'Needs repair', missing: 'Missing' };

  const DEFAULT_REMINDERS = [
    { days: 7, time: '09:00', note: 'Confirm rentals and crew' },
    { days: 2, time: '09:00', note: 'Prep and test gear' },
    { days: 1, time: '18:00', note: 'Charge batteries, clear cards' },
  ];

  // ---------- ids, dates ----------

  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const today = (at = Date.now()) => ymd(new Date(at));
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parse(s)) === s;
  const validTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  // Whole days from a to b (both YYYY-MM-DD), DST-safe.
  const daysBetween = (a, b) => Math.round((Date.UTC(...ymdParts(b)) - Date.UTC(...ymdParts(a))) / DAY);
  const ymdParts = s => { const [y, m, d] = s.split('-').map(Number); return [y, m - 1, d]; };
  // Local wall-clock time on a date, as epoch ms in this device's time zone.
  const at = (date, time) => { const d = parse(date); const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmtTime(t) {
    if (!validTime(t)) return '';
    let [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return m ? `${h}:${pad(m)} ${ap}` : `${h} ${ap}`;
  }
  function fmtDate(s, opts = {}) {
    const d = parse(s);
    const wd = WEEKDAYS[d.getDay()];
    const mo = MONTHS[d.getMonth()].slice(0, 3);
    return `${opts.noWeekday ? '' : wd + ', '}${mo} ${d.getDate()}${opts.year ? ', ' + d.getFullYear() : ''}`;
  }
  function fmtRange(p) {
    if (!p.end || p.end === p.start) return fmtDate(p.start);
    const a = parse(p.start), b = parse(p.end);
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${fmtDate(p.start)} – ${b.getDate()}`;
    return `${fmtDate(p.start)} – ${fmtDate(p.end)}`;
  }
  function leadText(days) {
    if (days === 0) return 'Day of';
    if (days === 1) return '1 day before';
    if (days % 7 === 0 && days >= 14) return `${days / 7} weeks before`;
    if (days === 7) return '1 week before';
    return `${days} days before`;
  }
  function untilText(date, now = Date.now()) {
    const n = daysBetween(today(now), date);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n < 0) return `${-n} days ago`;
    if (n < 14) return `In ${n} days`;
    if (n < 60) return `In ${Math.round(n / 7)} weeks`;
    return `In ${Math.round(n / 30)} months`;
  }

  // ---------- shape ----------

  const emptyState = () => ({ v: 1, projects: [], gear: [], kits: [], settings: { reminders: DEFAULT_REMINDERS.map(r => ({ ...r })), weekStart: 0, units: 'F' } });

  const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v, lo, hi, d) => (Number.isFinite(+v) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);

  function normReminders(list) {
    if (!Array.isArray(list)) return null;
    const seen = new Set();
    return list
      .map(r => ({ days: num(r && r.days, 0, 365, 1), time: validTime(r && r.time) ? r.time : '09:00', note: str(r && r.note, 80) }))
      .filter(r => { const k = r.days + '@' + r.time; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.days - a.days || a.time.localeCompare(b.time))
      .slice(0, 12);
  }

  function normProject(p) {
    if (!p || typeof p !== 'object' || !validDate(p.start)) return null;
    const end = validDate(p.end) && p.end >= p.start ? p.end : p.start;
    return {
      id: str(p.id, 40) || uid(),
      title: str(p.title, 120) || 'Untitled shoot',
      client: str(p.client, 120),
      location: str(p.location, 200),
      notes: str(p.notes, 5000),
      color: COLORS.includes(p.color) ? p.color : COLORS[0],
      status: STATUS[p.status] ? p.status : 'confirmed',
      start: p.start,
      end,
      call: validTime(p.call) ? p.call : '',
      // null = use the defaults from Settings; [] = no reminders for this one.
      reminders: p.reminders === null || p.reminders === undefined ? null : normReminders(p.reminders),
      gear: (Array.isArray(p.gear) ? p.gear : []).filter(g => g && g.item).map(g => ({
        item: str(g.item, 40), qty: num(g.qty, 1, 999, 1), packed: !!g.packed, returned: !!g.returned,
      })),
      extras: (Array.isArray(p.extras) ? p.extras : []).filter(x => x && x.name).map(x => ({
        id: str(x.id, 40) || uid(), name: str(x.name, 120), qty: num(x.qty, 1, 999, 1), packed: !!x.packed,
      })),
      created: num(p.created, 0, 1e15, 0),
      place: normPlace(p.place),
      wx: normWx(p.wx),
    };
  }

  // Where a shoot is, for weather and sun: { name, lat, lon, tz } or null.
  function normPlace(pl) {
    if (!pl || !Number.isFinite(+pl.lat) || !Number.isFinite(+pl.lon) || Math.abs(pl.lat) > 90 || Math.abs(pl.lon) > 180) return null;
    let tz = str(pl.tz, 64);
    try { new Intl.DateTimeFormat('en', { timeZone: tz || undefined }); } catch { tz = ''; }
    return { name: str(pl.name, 120) || 'Pinned place', lat: +(+pl.lat).toFixed(4), lon: +(+pl.lon).toFixed(4), tz };
  }

  // Last forecast fetched for a shoot: { at, key, days: { date: { hi, lo, rain, code, wind, gust } } } (°C, km/h).
  function normWx(w) {
    if (!w || typeof w !== 'object' || !w.days || typeof w.days !== 'object') return null;
    const days = {};
    for (const [d, v] of Object.entries(w.days)) {
      if (!validDate(d) || !v) continue;
      const n = x => (Number.isFinite(+x) && x !== null ? Math.round(+x * 10) / 10 : null);
      days[d] = { hi: n(v.hi), lo: n(v.lo), rain: n(v.rain), code: n(v.code), wind: n(v.wind), gust: n(v.gust) };
    }
    return { at: num(w.at, 0, 1e15, 0), key: str(w.key, 80), days };
  }

  function normGear(g) {
    if (!g || typeof g !== 'object' || !str(g.name)) return null;
    return {
      id: str(g.id, 40) || uid(),
      name: str(g.name, 120),
      category: CATEGORIES.includes(g.category) ? g.category : 'Other',
      serial: str(g.serial, 80),
      qty: num(g.qty, 1, 999, 1), // how many you own (batteries, cards)
      tracked: !!g.tracked,
      condition: CONDITION[g.condition] ? g.condition : 'ok',
      rental: !!g.rental,
      rentalFrom: str(g.rentalFrom, 120),
      returnBy: validDate(g.returnBy) ? g.returnBy : '',
      value: num(g.value, 0, 1e8, 0),
      notes: str(g.notes, 2000),
      // check-out history for tracked pieces: { at, project, kind: 'out' | 'in', note }
      log: (Array.isArray(g.log) ? g.log : []).filter(e => e && (e.kind === 'out' || e.kind === 'in')).map(e => ({
        at: num(e.at, 0, 1e15, 0), project: str(e.project, 40), kind: e.kind, note: str(e.note, 300),
      })).slice(-200),
    };
  }

  function normalize(s) {
    const base = emptyState();
    if (!s || typeof s !== 'object') return base;
    const projects = (Array.isArray(s.projects) ? s.projects : []).map(normProject).filter(Boolean);
    const gear = (Array.isArray(s.gear) ? s.gear : []).map(normGear).filter(Boolean);
    const ids = new Set(gear.map(g => g.id));
    projects.forEach(p => { p.gear = p.gear.filter(g => ids.has(g.item)); });
    const kits = (Array.isArray(s.kits) ? s.kits : []).filter(k => k && str(k.name)).map(k => ({
      id: str(k.id, 40) || uid(), name: str(k.name, 80),
      items: (Array.isArray(k.items) ? k.items : []).filter(i => ids.has(i)),
    }));
    const st = s.settings || {};
    return {
      v: 1, projects, gear, kits,
      settings: { reminders: normReminders(st.reminders) || base.settings.reminders, weekStart: st.weekStart === 1 ? 1 : 0, units: st.units === 'C' ? 'C' : 'F' },
    };
  }

  // ---------- queries ----------

  const byStart = (a, b) => a.start.localeCompare(b.start) || (a.call || '99').localeCompare(b.call || '99') || a.title.localeCompare(b.title);
  const live = p => p.status !== 'cancelled';
  const onDate = (s, date) => s.projects.filter(p => p.start <= date && p.end >= date).sort(byStart);
  const upcoming = (s, now = Date.now()) => s.projects.filter(p => p.end >= today(now) && live(p)).sort(byStart);
  const past = (s, now = Date.now()) => s.projects.filter(p => p.end < today(now)).sort((a, b) => -byStart(a, b));
  const remindersFor = (s, p) => (p.reminders === null ? s.settings.reminders : p.reminders);

  // The 6-week grid for a month: [{ date, inMonth }] × 42, starting on the chosen week day.
  function monthGrid(year, month, weekStart = 0) {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() - weekStart + 7) % 7;
    const start = ymd(new Date(year, month, 1 - lead));
    return Array.from({ length: 42 }, (_, i) => { const date = addDays(start, i); return { date, inMonth: parse(date).getMonth() === month }; });
  }

  // Lays out multi-day projects as bars across one week row: [{ p, col, span, lane, startsHere, endsHere }].
  function weekBars(s, weekDates) {
    const a = weekDates[0], b = weekDates[weekDates.length - 1];
    const items = s.projects.filter(p => p.start <= b && p.end >= a && live(p))
      .sort((x, y) => x.start.localeCompare(y.start) || daysBetween(y.start, y.end) - daysBetween(x.start, x.end) || byStart(x, y));
    const lanes = [];
    return items.map(p => {
      const from = p.start < a ? a : p.start, to = p.end > b ? b : p.end;
      const col = daysBetween(a, from), span = daysBetween(from, to) + 1;
      let lane = 0;
      while ((lanes[lane] || []).some(([c, e]) => col <= e && col + span - 1 >= c)) lane++;
      (lanes[lane] = lanes[lane] || []).push([col, col + span - 1]);
      return { p, col, span, lane, startsHere: p.start >= a, endsHere: p.end <= b };
    });
  }

  // ---------- packing ----------

  function packing(p) {
    const total = p.gear.length + p.extras.length;
    const done = p.gear.filter(g => g.packed).length + p.extras.filter(x => x.packed).length;
    return { total, done };
  }

  // Tracked gear booked on two live projects whose dates overlap.
  function conflicts(s, p) {
    const out = [];
    for (const g of p.gear) {
      const item = s.gear.find(x => x.id === g.item);
      if (!item || !item.tracked) continue;
      for (const q of s.projects) {
        if (q.id === p.id || !live(q) || !live(p) || q.status === 'wrapped') continue;
        if (q.start <= p.end && q.end >= p.start && q.gear.some(x => x.item === g.item)) out.push({ item, other: q });
      }
    }
    return out;
  }

  // Where a tracked piece is: last log entry decides. { state: 'in' | 'out', project, at }
  function whereIs(s, item) {
    const last = item.log[item.log.length - 1];
    if (!last || last.kind === 'in') return { state: 'in', at: last ? last.at : 0 };
    return { state: 'out', project: s.projects.find(p => p.id === last.project) || null, at: last.at };
  }

  // Rentals due back within `days` (or overdue).
  function rentalsDue(s, days = 7, now = Date.now()) {
    const t = today(now);
    return s.gear.filter(g => g.rental && g.returnBy && daysBetween(t, g.returnBy) <= days).sort((a, b) => a.returnBy.localeCompare(b.returnBy));
  }

  // ---------- reminders ----------

  // Every reminder still ahead: [{ key, at, pid, days }], soonest first. Keys are opaque ids
  // ("project:days:time"), so the sender learns nothing about the shoot.
  function schedule(s, now = Date.now(), limit = 300) {
    const out = [];
    for (const p of s.projects) {
      if (!live(p) || p.status === 'wrapped') continue;
      for (const r of remindersFor(s, p) || []) {
        const when = at(addDays(p.start, -r.days), r.time);
        if (when > now) out.push({ key: `${p.id}:${r.days}:${r.time}`, at: when, pid: p.id, days: r.days, note: r.note });
      }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, limit);
  }

  // Reminders that should be on screen now (just passed and not shown yet).
  function due(s, now = Date.now(), shown = {}, window = 45 * 60000) {
    const out = [];
    for (const p of s.projects) {
      if (!live(p) || p.status === 'wrapped') continue;
      for (const r of remindersFor(s, p) || []) {
        const key = `${p.id}:${r.days}:${r.time}`;
        const when = at(addDays(p.start, -r.days), r.time);
        if (when <= now + 2 * 60000 && when > now - window && !shown[key]) out.push({ key, at: when, p, days: r.days, note: r.note });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  function notice(s, p, days, note, now = Date.now()) {
    const pk = packing(p);
    const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
    const call = p.call ? ` · call ${fmtTime(p.call)}` : '';
    const bits = [`${fmtRange(p)}${call}`];
    if (note) bits.unshift(note);
    if (p.location) bits.push(p.location);
    const w = wxLine(s, p, p.start, now);
    if (w) bits.push(w);
    bits.push(pk.total ? `${pk.done} of ${pk.total} packed. Tap for the gear list.` : 'No gear list yet. Tap to build one.');
    return { title: `${when}: ${p.title}`, body: bits.join('\n'), url: `./#project/${p.id}/gear` };
  }

  // What a push with nothing due says (iOS insists every push shows something).
  function fallbackNotice(s, now = Date.now()) {
    const next = upcoming(s, now)[0];
    if (!next) return { title: 'Slate', body: 'Nothing on the calendar.', url: './' };
    return { title: `Next up: ${next.title}`, body: `${untilText(next.start, now)} · ${fmtRange(next)}`, url: `./#project/${next.id}/gear` };
  }

  // ---------- export ----------

  function gearCSV(s) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Name', 'Category', 'Serial', 'Qty', 'Value', 'Owned/Rental', 'Rental from', 'Return by', 'Condition', 'Notes']];
    for (const g of [...s.gear].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) {
      rows.push([g.name, g.category, g.serial, g.qty, g.value || '', g.rental ? 'Rental' : 'Owned', g.rentalFrom, g.returnBy, CONDITION[g.condition], g.notes]);
    }
    return rows.map(r => r.map(q).join(',')).join('\r\n');
  }

  // An .ics with each shoot and its reminders as alarms, for the iPad's own Calendar.
  function ics(s, list) {
    const esc = v => String(v || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const d = x => x.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Slate//EN', 'CALSCALE:GREGORIAN'];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    for (const p of list) {
      lines.push('BEGIN:VEVENT', `UID:${p.id}@slate`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(p.title)}`,
        `DTSTART;VALUE=DATE:${d(p.start)}`, `DTEND;VALUE=DATE:${d(addDays(p.end, 1))}`);
      if (p.location) lines.push(`LOCATION:${esc(p.location)}`);
      const desc = [p.client && `Client: ${p.client}`, p.call && `Call: ${fmtTime(p.call)}`, p.notes].filter(Boolean).join('\n');
      if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
      for (const r of remindersFor(s, p) || []) {
        // Alarm relative to the all-day start (midnight): back off the days, forward to the time.
        const [h, m] = r.time.split(':').map(Number);
        const mins = r.days * 1440 - (h * 60 + m);
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(p.title)}`, `TRIGGER:${mins >= 0 ? '-' : ''}PT${Math.abs(mins)}M`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }


  // ---------- sun ----------

  const RAD = Math.PI / 180;
  // Sun events for a date at a place, as epoch ms (null when the sun never crosses that angle).
  // Standard sunrise equation; good to about a minute.
  function sunTimes(date, lat, lon) {
    const [y, m, d] = ymdParts(date);
    const n = Math.round(Date.UTC(y, m, d, 12) / DAY + 2440587.5 - 2451545.0);
    const Jstar = n - lon / 360;
    const M = (357.5291 + 0.98560028 * Jstar) % 360;
    const Cc = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
    const L = (M + Cc + 180 + 102.9372) % 360;
    const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
    const dec = Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD));
    const toMs = J => Math.round((J - 2440587.5) * DAY);
    const pair = h => {
      const c = (Math.sin(h * RAD) - Math.sin(lat * RAD) * Math.sin(dec)) / (Math.cos(lat * RAD) * Math.cos(dec));
      if (c < -1 || c > 1) return [null, null];
      const w = Math.acos(c) / RAD / 360;
      return [toMs(Jtransit - w), toMs(Jtransit + w)];
    };
    const [rise, set] = pair(-0.833);
    const [dawn, dusk] = pair(-6);
    const [goldenEnd, goldenStart] = pair(6); // morning golden hour ends / evening one starts
    return { dawn, rise, goldenEnd, noon: toMs(Jtransit), goldenStart, set, dusk };
  }

  // A clock time in a time zone ('' = this device's), like "4:52 PM".
  function clock(ms, tz) {
    if (ms === null || ms === undefined) return '—';
    try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined }).format(new Date(ms)); }
    catch { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms)); }
  }

  // ---------- weather ----------

  const WX = [
    [[0], '☀️', 'Clear'], [[1], '🌤️', 'Mostly clear'], [[2], '⛅', 'Partly cloudy'], [[3], '☁️', 'Overcast'],
    [[45, 48], '🌫️', 'Fog'], [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'], [[61, 63, 66], '🌧️', 'Rain'], [[65, 67], '🌧️', 'Heavy rain'],
    [[71, 73, 75, 77], '🌨️', 'Snow'], [[80, 81, 82], '🌦️', 'Showers'], [[85, 86], '🌨️', 'Snow showers'], [[95, 96, 99], '⛈️', 'Thunderstorms'],
  ];
  function wxKind(code) { const k = WX.find(w => w[0].includes(code)); return k ? { icon: k[1], name: k[2] } : { icon: '🌡️', name: 'Forecast' }; }
  const FORECAST_DAYS = 16;

  const temp = (c, units) => (c === null ? '–' : Math.round(units === 'C' ? c : c * 9 / 5 + 32) + '°');
  const speed = (k, units) => (k === null ? '–' : units === 'C' ? `${Math.round(k)} km/h` : `${Math.round(k / 1.609)} mph`);

  // Open-Meteo daily response → { date: {...} }.
  function parseForecast(j) {
    const d = j && j.daily;
    if (!d || !Array.isArray(d.time)) throw new Error('no forecast');
    const days = {};
    d.time.forEach((t, i) => {
      const g = k => (d[k] ? d[k][i] : null);
      days[t] = { hi: g('temperature_2m_max'), lo: g('temperature_2m_min'), rain: g('precipitation_probability_max'), code: g('weather_code'), wind: g('wind_speed_10m_max'), gust: g('wind_gusts_10m_max') };
    });
    return days;
  }

  // Which shoots need a fresh forecast: upcoming, placed, within forecast range, older than maxAge.
  function needsForecast(s, now = Date.now(), maxAge = 2 * 3600000) {
    const t = today(now);
    return s.projects.filter(p => live(p) && p.place && p.end >= t && daysBetween(t, p.start) < FORECAST_DAYS
      && (!p.wx || p.wx.key !== wxKey(p) || now - p.wx.at > maxAge));
  }
  const wxKey = p => (p.place ? `${p.place.lat},${p.place.lon}` : '');
  function forecastFor(p, date) {
    return p.wx && p.wx.key === wxKey(p) ? p.wx.days[date] || null : null;
  }
  function wxLine(s, p, date, now = Date.now()) {
    const f = forecastFor(p, date);
    if (!f) return '';
    const k = wxKind(f.code);
    const u = s.settings.units;
    const bits = [`${k.icon} ${k.name} ${temp(f.hi, u)}/${temp(f.lo, u)}`];
    if (f.rain !== null) bits.push(`${Math.round(f.rain)}% rain`);
    if (f.gust !== null && f.gust >= 40) bits.push(`gusts ${speed(f.gust, u)}`);
    return bits.join(' · ');
  }

  // ---------- QR labels ----------

  const LABEL_BASE = 'https://noahwitchell.github.io/slate/#gear/';
  const labelURL = id => LABEL_BASE + id;
  // Reads a gear id from a scanned code: our label URL, or a bare id.
  function scannedId(text) {
    const m = /#gear\/([A-Za-z0-9_-]{1,40})\s*$/.exec(String(text || '').trim());
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{3,40}$/.test(String(text || '').trim()) ? String(text).trim() : null;
  }

  G.Core = {
    DAY, CATEGORIES, STATUS, COLORS, CONDITION, DEFAULT_REMINDERS, MONTHS, WEEKDAYS,
    uid, ymd, parse, addDays, today, daysBetween, at, validDate, validTime,
    fmtTime, fmtDate, fmtRange, leadText, untilText,
    emptyState, normalize, normProject, normGear, normReminders,
    onDate, upcoming, past, remindersFor, monthGrid, weekBars, packing, conflicts, whereIs, rentalsDue,
    schedule, due, notice, fallbackNotice, gearCSV, ics,
    normPlace, sunTimes, clock, wxKind, temp, speed, parseForecast, needsForecast, forecastFor, wxLine, wxKey, FORECAST_DAYS,
    labelURL, scannedId,
  };
})(globalThis);
