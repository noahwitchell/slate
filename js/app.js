import './core.js';
import { load, save, mirror, requestPersistence, deliverFile } from './store.js';
import * as Push from './push.js';

const C = globalThis.Core;
let S = load();
const now = () => Date.now();
const t0 = new Date();
const ui = {
  tab: 'cal', y: t0.getFullYear(), m: t0.getMonth(), sel: C.today(),
  shoots: 'upcoming', gearView: 'items', gearFilter: 'all', gearQ: '',
  push: { state: 'off' },
};
let sheetState = null; // { kind, id, tab, mode, q, cat }

const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const sheetBody = sheet.querySelector('.sheet-body');
const toastEl = document.getElementById('toast');

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const proj = id => S.projects.find(p => p.id === id);
const item = id => S.gear.find(g => g.id === id);
const kit = id => S.kits.find(k => k.id === id);
const money = v => v ? '$' + Number(v).toLocaleString() : '';

// ---------- saving + reminder sync ----------

let syncTimer = null;
function commit() {
  save(S);
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { if (ui.push.state === 'on') Push.sync(S).catch(() => {}); }, 1500);
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.add('hidden'), 2400);
}

// ---------- icons ----------

const I = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  shoots: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z"/><path d="M4 9.5 3.4 6a1 1 0 0 1 .8-1.2l13.6-2.4a1 1 0 0 1 1.2.8l.5 2.7z"/><path d="m8.5 4.2 2.6 3.6M13.6 3.3l2.6 3.6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="2.5" y="7" width="14" height="11" rx="2.5"/><path d="m16.5 10.5 5-3v10l-5-3z"/><circle cx="9.5" cy="12.5" r="2.6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>',
};

// ---------- shell ----------

const TABS = [['cal', 'Calendar'], ['shoots', 'Shoots'], ['gear', 'Gear'], ['settings', 'Settings']];

function shell() {
  app.innerHTML = `
    <nav class="tabs">
      <div class="brand"><img src="icons/icon-192.png" alt=""></div>
      ${TABS.map(([k, n]) => `<button data-act="tab" data-tab="${k}">${I[k]}${n}</button>`).join('')}
    </nav>
    <main class="main" id="main"></main>`;
}

function render() {
  app.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const main = document.getElementById('main');
  const keep = main.querySelector('.scroll, .cal-body')?.scrollTop || 0;
  main.innerHTML = ui.tab === 'cal' ? calView() : ui.tab === 'shoots' ? shootsView() : ui.tab === 'gear' ? gearView() : settingsView();
  const sc = main.querySelector('.scroll, .cal-body');
  if (sc && render.sameTab === ui.tab) sc.scrollTop = keep;
  render.sameTab = ui.tab;
}

// ---------- shared bits ----------

function shootCard(p, opts = {}) {
  const pk = C.packing(p);
  const pct = pk.total ? Math.round(pk.done / pk.total * 100) : 0;
  const conf = C.conflicts(S, p).length;
  const meta = [C.fmtRange(p), p.call && `Call ${C.fmtTime(p.call)}`].filter(Boolean).join(' · ');
  const sub = [p.location, p.client].filter(Boolean).join(' · ');
  return `<button class="shoot" data-act="open" data-id="${p.id}" style="--c:${p.color}">
    <span class="stripe ${p.status === 'hold' ? 'hold' : ''}"></span>
    <span class="body">
      <div class="t">${esc(p.title)}</div>
      <div class="m">${esc(meta)}${opts.until ? ` <span class="muted">· ${C.untilText(p.start)}</span>` : ''}</div>
      ${sub ? `<div class="m2">${esc(sub)}</div>` : ''}
    </span>
    <span class="right">
      ${p.status !== 'confirmed' ? `<span class="tag ${p.status === 'hold' ? 'hold' : ''}">${C.STATUS[p.status].name}</span>` : conf ? `<span class="tag warn">Gear clash</span>` : '<span></span>'}
      ${pk.total ? `<span class="ring" style="--p:${pct}" data-t="${pk.done}/${pk.total}"></span>` : ''}
    </span>
  </button>`;
}

function alertsBanner() {
  const due = C.rentalsDue(S, 3);
  if (!due.length) return '';
  const t = C.today();
  return due.map(g => {
    const n = C.daysBetween(t, g.returnBy);
    const when = n < 0 ? `was due ${C.fmtDate(g.returnBy)}` : n === 0 ? 'is due back today' : `is due back ${C.untilText(g.returnBy).toLowerCase()}`;
    return `<button class="banner ${n < 0 ? 'warn' : ''}" data-act="open-gear" data-id="${g.id}">${I.warn}<span class="grow"><b>${esc(g.name)}</b> (rental${g.rentalFrom ? ' from ' + esc(g.rentalFrom) : ''}) ${when}</span>${I.chev}</button>`;
  }).join('');
}

// ---------- calendar ----------

function calView() {
  const grid = C.monthGrid(ui.y, ui.m, S.settings.weekStart);
  const weeks = [];
  for (let i = 0; i < 42; i += 7) weeks.push(grid.slice(i, i + 7));
  // Drop a trailing week that is all next month.
  if (weeks.length && weeks[5].every(d => !d.inMonth)) weeks.pop();
  const t = C.today();
  const names = Array.from({ length: 7 }, (_, i) => C.WEEKDAYS[(i + S.settings.weekStart) % 7]);
  const wide = innerWidth >= 700;
  const LANES = 3;
  const lanePx = wide ? 23 : 7;
  const monthHTML = weeks.map(w => {
    const dates = w.map(d => d.date);
    const bars = C.weekBars(S, dates);
    const hidden = Array(7).fill(0);
    const barHTML = bars.map(b => {
      if (b.lane >= LANES) { for (let c = b.col; c < b.col + b.span; c++) hidden[c]++; return ''; }
      const label = (b.startsHere || b.col === 0) ? esc(b.p.title) : '';
      const cls = ['bar', b.p.status === 'hold' && 'hold', b.p.status === 'wrapped' && 'wrapped', !b.startsHere && 'cont-l', !b.endsHere && 'cont-r'].filter(Boolean).join(' ');
      const inset = wide ? 3 : 4;
      return `<div class="${cls}" style="background-color:${b.p.color};left:calc(${b.col} * 100% / 7 + ${b.startsHere ? inset : 0}px);width:calc(${b.span} * 100% / 7 - ${(b.startsHere ? inset : 0) + (b.endsHere ? inset : 0)}px);top:${b.lane * lanePx}px">${label}</div>`;
    }).join('');
    const more = hidden.map((n, c) => n ? `<div class="more" style="left:calc(${c} * 100% / 7 + 6px);top:${LANES * lanePx}px">+${n}</div>` : '').join('');
    const lanesUsed = Math.min(LANES + (hidden.some(Boolean) ? 1 : 0), bars.reduce((m, b) => Math.max(m, b.lane + 1), 0) + (hidden.some(Boolean) ? 1 : 0));
    const minH = 36 + lanesUsed * lanePx + 6;
    return `<div class="week" style="min-height:max(var(--wk, 0px), ${minH}px)">
      ${w.map(d => {
        const wd = C.parse(d.date).getDay();
        const cls = ['day', !d.inMonth && 'out', d.date === t && 'today', d.date === ui.sel && 'sel', d.date < t && 'past', (wd === 0 || wd === 6) && 'we'].filter(Boolean).join(' ');
        return `<button class="${cls}" data-act="day" data-date="${d.date}"><span class="num">${C.parse(d.date).getDate()}</span></button>`;
      }).join('')}
      <div class="bars">${barHTML}${more}</div>
    </div>`;
  }).join('');

  return `<div class="cal-wrap">
    <header class="head">
      <div class="cal-title">${C.MONTHS[ui.m]} <span>${ui.y}</span></div>
      <div class="cal-nav">
        <button class="icon-btn" data-act="month" data-d="-1" aria-label="Previous month">${I.left}</button>
        <button class="btn small" data-act="today">Today</button>
        <button class="icon-btn" data-act="month" data-d="1" aria-label="Next month">${I.right}</button>
        <button class="btn primary small" data-act="new" style="margin-left:6px">${I.plus}Shoot</button>
      </div>
    </header>
    <div class="cal-body" id="cal-body">
      <div class="month">
        <div class="dow">${names.map(n => `<div class="${n === 'Sat' || n === 'Sun' ? 'we' : ''}">${n}</div>`).join('')}</div>
        <div class="weeks">${monthHTML}</div>
      </div>
      ${innerWidth < 1100 ? agenda() : ''}
    </div>
    ${innerWidth >= 1100 ? `<aside class="side">${agenda()}</aside>` : ''}
  </div>`;
}

function agenda() {
  const day = C.onDate(S, ui.sel);
  const shownIds = new Set(day.map(p => p.id));
  const next = C.upcoming(S).filter(p => !shownIds.has(p.id)).slice(0, 8);
  return `<div class="agenda">
    ${alertsBanner()}
    <div class="day-title"><span class="grow">${ui.sel === C.today() ? 'Today · ' : ''}${C.fmtDate(ui.sel)}</span>
      <button class="btn small" data-act="new">${I.plus}Add</button></div>
    ${day.length ? day.map(p => shootCard(p)).join('') : `<div class="empty" style="padding:8px 0 4px;text-align:left">Nothing booked.</div>`}
    <h2>Coming up</h2>
    ${next.length ? next.map(p => shootCard(p, { until: true })).join('') : `<div class="empty" style="text-align:left;padding:4px 0">No shoots ahead.</div>`}
  </div>`;
}

// ---------- shoots list ----------

function shootsView() {
  const list = ui.shoots === 'upcoming' ? C.upcoming(S) : ui.shoots === 'past' ? C.past(S) : S.projects.filter(p => p.status === 'hold' && p.end >= C.today()).sort((a, b) => a.start.localeCompare(b.start));
  let lastMonth = '';
  const body = list.map(p => {
    const d = C.parse(p.start);
    const mk = `${C.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const h = mk !== lastMonth ? `<div class="cat-h">${mk}</div>` : '';
    lastMonth = mk;
    return h + shootCard(p, { until: ui.shoots !== 'past' });
  }).join('');
  const holds = S.projects.filter(p => p.status === 'hold' && p.end >= C.today()).length;
  return `<header class="head"><h1>Shoots</h1><button class="btn primary small" data-act="new">${I.plus}Shoot</button></header>
    <div class="scroll">
      <div class="seg" style="margin-bottom:14px">
        <button data-act="shoots-seg" data-v="upcoming" class="${ui.shoots === 'upcoming' ? 'on' : ''}">Upcoming</button>
        <button data-act="shoots-seg" data-v="holds" class="${ui.shoots === 'holds' ? 'on' : ''}">Holds${holds ? ` (${holds})` : ''}</button>
        <button data-act="shoots-seg" data-v="past" class="${ui.shoots === 'past' ? 'on' : ''}">Past</button>
      </div>
      ${alertsBanner()}
      <div style="max-width:760px">${body || `<div class="empty">${ui.shoots === 'past' ? 'No past shoots yet.' : 'Nothing booked yet.'}<br><button class="btn primary" data-act="new">${I.plus}New shoot</button></div>`}</div>
    </div>`;
}

// ---------- gear inventory ----------

function gearMatches(g) {
  const q = ui.gearQ.trim().toLowerCase();
  if (q && !`${g.name} ${g.serial} ${g.category} ${g.notes} ${g.rentalFrom}`.toLowerCase().includes(q)) return false;
  if (ui.gearFilter === 'tracked') return g.tracked;
  if (ui.gearFilter === 'rental') return g.rental;
  if (ui.gearFilter === 'attention') return g.condition !== 'ok';
  if (ui.gearFilter === 'out') return g.tracked && C.whereIs(S, g).state === 'out';
  return true;
}

function gearStatusTag(g) {
  if (g.condition !== 'ok') return `<span class="tag warn">${C.CONDITION[g.condition]}</span>`;
  if (g.tracked) {
    const w = C.whereIs(S, g);
    return w.state === 'out' ? `<span class="tag hold">Out${w.project ? ' · ' + esc(w.project.title) : ''}</span>` : `<span class="tag good">In</span>`;
  }
  if (g.rental && g.returnBy) return `<span class="tag">Due ${C.fmtDate(g.returnBy, { noWeekday: true })}</span>`;
  return '';
}

function gearRows() {
  const list = S.gear.filter(gearMatches);
  if (!S.gear.length) return `<div class="empty">No gear yet. Add the pieces you bring to shoots: bodies, lenses, batteries, cards.<br><button class="btn primary" data-act="new-gear">${I.plus}Add gear</button></div>`;
  if (!list.length) return `<div class="empty">Nothing matches.</div>`;
  return C.CATEGORIES.map(cat => {
    const rows = list.filter(g => g.category === cat).sort((a, b) => a.name.localeCompare(b.name));
    if (!rows.length) return '';
    return `<div class="cat-h">${cat} <span class="n">${rows.length}</span></div><div class="list">${rows.map(g => `
      <button class="row" data-act="open-gear" data-id="${g.id}">
        <span class="grow"><div class="t">${esc(g.name)}${g.qty > 1 ? ` <span class="qty">×${g.qty}</span>` : ''}</div>
        <div class="s">${esc([g.serial && 'SN ' + g.serial, g.rental && ('Rental' + (g.rentalFrom ? ' · ' + g.rentalFrom : '')), money(g.value)].filter(Boolean).join(' · ') || ' ')}</div></span>
        ${gearStatusTag(g)}<span class="chev">${I.chev}</span>
      </button>`).join('')}</div>`;
  }).join('');
}

function gearView() {
  const n = f => S.gear.filter(g => f === 'all' || (f === 'tracked' ? g.tracked : f === 'rental' ? g.rental : f === 'out' ? g.tracked && C.whereIs(S, g).state === 'out' : g.condition !== 'ok')).length;
  const chips = [['all', 'All'], ['tracked', 'Tracked'], ['out', 'Checked out'], ['rental', 'Rentals'], ['attention', 'Needs attention']];
  const items = `
    <div class="search">${I.search}<input id="gear-q" type="search" placeholder="Search name, serial, notes" value="${esc(ui.gearQ)}" autocomplete="off"></div>
    <div class="chips" style="margin-bottom:6px">${chips.map(([k, l]) => `<button class="chip ${ui.gearFilter === k ? 'on' : ''}" data-act="gear-filter" data-v="${k}">${l} <span class="n">${n(k)}</span></button>`).join('')}</div>
    <div id="gear-rows">${gearRows()}</div>`;
  const kits = `
    <p class="hint" style="margin:0 4px 14px">Kits are sets you pack together (A-cam package, audio bag, lighting kit). Add a whole kit to a shoot in one tap.</p>
    ${S.kits.length ? `<div class="list">${S.kits.map(k => `<button class="row" data-act="open-kit" data-id="${k.id}"><span class="grow"><div class="t">${esc(k.name)}</div><div class="s">${plural(k.items.length, 'piece')}</div></span><span class="chev">${I.chev}</span></button>`).join('')}</div>` : `<div class="empty">No kits yet.</div>`}
    <div style="margin-top:14px"><button class="btn" data-act="new-kit">${I.plus}New kit</button></div>`;
  const value = S.gear.reduce((a, g) => a + (g.rental ? 0 : g.value * g.qty), 0);
  return `<header class="head"><h1>Gear</h1>
      <div class="seg"><button data-act="gear-view" data-v="items" class="${ui.gearView === 'items' ? 'on' : ''}">Items</button><button data-act="gear-view" data-v="kits" class="${ui.gearView === 'kits' ? 'on' : ''}">Kits</button></div>
      <button class="btn primary small" data-act="${ui.gearView === 'kits' ? 'new-kit' : 'new-gear'}">${I.plus}${ui.gearView === 'kits' ? 'Kit' : 'Gear'}</button></header>
    <div class="scroll"><div style="max-width:860px">
      ${alertsBanner()}
      ${ui.gearView === 'items' ? items : kits}
      ${ui.gearView === 'items' && value ? `<p class="hint" style="margin-top:16px">Owned gear value: ${money(value)}. Settings → Export gear list gives an insurance-ready CSV with serials.</p>` : ''}
    </div></div>`;
}

// ---------- settings ----------

function remEditor(list, scope) {
  const has = new Set(list.map(r => r.days));
  const presets = [[14, '2 weeks'], [7, '1 week'], [3, '3 days'], [2, '2 days'], [1, '1 day'], [0, 'Day of']];
  return `<div class="form">${list.length ? list.map((r, i) => `
      <div class="rem">
        <span class="stepper"><button data-act="rem-days" data-scope="${scope}" data-i="${i}" data-d="-1" aria-label="Fewer days">−</button><span>${r.days}</span><button data-act="rem-days" data-scope="${scope}" data-i="${i}" data-d="1" aria-label="More days">+</button></span>
        <span class="lead">${r.days === 0 ? 'Day of' : r.days === 1 ? 'day before' : 'days before'}</span>
        <input type="time" value="${r.time}" data-rem="time" data-scope="${scope}" data-i="${i}" aria-label="Time">
        <button class="x" data-act="rem-del" data-scope="${scope}" data-i="${i}" aria-label="Remove">${I.x}</button>
      </div>
      <div class="field" style="min-height:40px;border-top:0;padding-top:0;margin-top:-6px"><input style="text-align:left;padding:4px 0 10px;font-size:14px;color:var(--ink2)" placeholder="Note (e.g. Confirm rentals)" value="${esc(r.note)}" data-rem="note" data-scope="${scope}" data-i="${i}"></div>`).join('')
    : `<div class="rem"><span class="lead muted">No reminders.</span></div>`}</div>
    <div class="chips" style="margin:-6px 0 16px">${presets.map(([d, l]) => `<button class="chip" data-act="rem-add" data-scope="${scope}" data-days="${d}" ${has.has(d) ? 'disabled style="opacity:.35"' : ''}>${I.plus.replace('<svg', '<svg width="14" height="14"')}${l}</button>`).join('')}</div>`;
}

function pushBlock() {
  const st = ui.push.state;
  const line = {
    install: `To get reminders on this ${/iPhone/.test(navigator.userAgent) ? 'iPhone' : 'iPad'}, add Slate to the Home Screen first: tap Share, then <b>Add to Home Screen</b>, and open it from there.`,
    unsupported: 'This browser can\'t receive reminders. Open Slate from the Home Screen on the iPad or iPhone.',
    denied: 'Notifications are blocked for Slate. Turn them on in the iPad\'s Settings → Notifications → Slate.',
    off: 'Reminders are off. Turn them on to get a notification before each shoot; tapping it opens that shoot\'s gear list.',
    on: 'Reminders are on for this device. Tap one to open that shoot\'s gear list.',
  }[st] || '';
  const next = C.schedule(S).slice(0, 3);
  return `<div class="form"><div class="field" style="padding:14px;gap:14px">${I.bell}<span style="flex:1;font-size:15px;line-height:1.45">${line}</span></div>
    ${st === 'off' || st === 'on' ? `<div class="field" style="justify-content:flex-end;gap:8px;padding:10px 14px;flex-wrap:wrap">
      ${st === 'on' ? `<button class="btn small" data-act="push-test">Send a test</button><button class="btn small danger" data-act="push-off">Turn off</button>` : `<button class="btn primary small" data-act="push-on">Turn on reminders</button>`}
    </div>` : ''}
    ${next.length ? `<div class="field" style="flex-direction:column;align-items:stretch;padding:12px 14px;gap:4px"><div class="muted" style="font-size:13px">Next reminders</div>${next.map(a => {
      const p = proj(a.pid); const d = new Date(a.at);
      return `<div style="font-size:14.5px">${C.fmtDate(C.ymd(d))}, ${C.fmtTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)} · <b>${esc(p.title)}</b>${a.note ? ` <span class="muted">· ${esc(a.note)}</span>` : ''}</div>`;
    }).join('')}</div>` : ''}
  </div>`;
}

function settingsView() {
  return `<header class="head"><h1>Settings</h1></header>
    <div class="scroll"><div class="grid2" style="max-width:1000px">
      <div>
        <div class="form-h">Reminders</div>
        ${pushBlock()}
        <div class="form-h">Default reminders</div>
        <p class="hint" style="margin:0 4px 10px">Every new shoot gets these. Each shoot can use its own instead (Shoot → Details).</p>
        ${remEditor(S.settings.reminders, 'defaults')}
      </div>
      <div>
        <div class="form-h">Calendar</div>
        <div class="form"><div class="field"><span class="lbl">Week starts</span><span class="end"><span class="seg">
          <button data-act="week-start" data-v="0" class="${S.settings.weekStart === 0 ? 'on' : ''}">Sunday</button>
          <button data-act="week-start" data-v="1" class="${S.settings.weekStart === 1 ? 'on' : ''}">Monday</button></span></span></div></div>
        <div class="form-h">Your data</div>
        <div class="form">
          <button class="row" data-act="backup"><span class="grow"><div class="t">Save a backup</div><div class="s">Everything, as one file (Files, AirDrop, Dropbox)</div></span><span class="chev">${I.chev}</span></button>
          <label class="row" style="cursor:pointer"><span class="grow"><div class="t">Restore a backup</div><div class="s">Replaces what's on this device</div></span><span class="chev">${I.chev}</span><input type="file" id="restore" accept=".json,application/json" hidden></label>
          <button class="row" data-act="export-csv"><span class="grow"><div class="t">Export gear list</div><div class="s">CSV with serials and values, for insurance</div></span><span class="chev">${I.chev}</span></button>
          <button class="row" data-act="export-ics"><span class="grow"><div class="t">Add shoots to Calendar</div><div class="s">An .ics file of upcoming shoots with their reminders</div></span><span class="chev">${I.chev}</span></button>
          ${!S.projects.length && !S.gear.length ? `<button class="row" data-act="sample"><span class="grow"><div class="t">Load example data</div><div class="s">A few shoots and a camera package to try things out</div></span><span class="chev">${I.chev}</span></button>` : ''}
        </div>
        <p class="hint">Your shoots and gear stay on this device. The reminder service only gets a list of times to send a nudge, never titles, clients or gear.</p>
      </div>
    </div></div>`;
}

// ---------- sheets ----------

function openSheet(state) {
  sheetState = state;
  sheet.classList.remove('hidden');
  sheet.className = 'sheet' + (state.kind === 'project' || state.kind === 'pick' ? ' full' : '') + (state.kind === 'kit' || state.kind === 'gear' ? ' narrow' : '');
  renderSheet(true);
}
function closeSheet() {
  const back = sheetState && sheetState.back;
  sheetState = null;
  if (back) return openSheet(back);
  sheet.classList.add('hidden');
  sheetBody.innerHTML = '';
  render();
}
function renderSheet(fresh) {
  if (!sheetState) return;
  const sc = sheetBody.querySelector('.sh-scroll');
  const keep = fresh ? 0 : sc ? sc.scrollTop : 0;
  const k = sheetState.kind;
  sheetBody.innerHTML = k === 'project' ? projectSheet() : k === 'gear' ? gearSheet() : k === 'kit' ? kitSheet() : k === 'pick' ? pickSheet() : '';
  const sc2 = sheetBody.querySelector('.sh-scroll');
  if (sc2) sc2.scrollTop = keep;
}

// ----- project -----

function projectSheet() {
  const p = proj(sheetState.id);
  if (!p) { setTimeout(closeSheet); return ''; }
  const tab = sheetState.tab || 'gear';
  const pk = C.packing(p);
  return `<div class="sh-head"><button class="btn ghost" data-act="close">Done</button><h3></h3><span style="width:72px"></span></div>
    <div class="p-top" style="border-top:4px solid ${p.color}">
      <input class="t-in" value="${esc(p.title)}" data-pf="title" placeholder="Shoot name" autocomplete="off">
      <div class="meta"><span>${C.fmtRange(p)}</span>${p.call ? `<span>· Call ${C.fmtTime(p.call)}</span>` : ''}<span class="muted">· ${C.untilText(p.start)}</span>
        ${p.status !== 'confirmed' ? `<span class="tag ${p.status === 'hold' ? 'hold' : ''}">${C.STATUS[p.status].name}</span>` : ''}</div>
      <div class="seg"><button data-act="ptab" data-v="gear" class="${tab === 'gear' ? 'on' : ''}">Gear${pk.total ? ` ${pk.done}/${pk.total}` : ''}</button><button data-act="ptab" data-v="details" class="${tab === 'details' ? 'on' : ''}">Details</button></div>
    </div>
    <div class="sh-scroll">${tab === 'gear' ? projectGear(p) : projectDetails(p)}</div>`;
}

function projectDetails(p) {
  const own = p.reminders !== null;
  const rems = C.remindersFor(S, p);
  return `
    <div class="form">
      <div class="field"><label>Status</label><select data-pf="status">${Object.entries(C.STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
      <div class="field"><label>Starts</label><input type="date" value="${p.start}" data-pf="start"></div>
      <div class="field"><label>Ends</label><input type="date" value="${p.end}" min="${p.start}" data-pf="end"></div>
      <div class="field"><label>Call time</label><input type="time" value="${p.call}" data-pf="call"></div>
      <div class="field"><label>Location</label><input value="${esc(p.location)}" data-pf="location" placeholder="Studio, address" autocomplete="off"></div>
      <div class="field"><label>Client</label><input value="${esc(p.client)}" data-pf="client" placeholder="Who it's for" autocomplete="off"></div>
      <div class="field"><span class="lbl">Color</span><span class="end swatches">${C.COLORS.map(c => `<button class="swatch ${p.color === c ? 'on' : ''}" style="--c:${c}" data-act="pcolor" data-v="${c}" aria-label="Color"></button>`).join('')}</span></div>
      <div class="field tall"><label>Notes</label><textarea data-pf="notes" placeholder="Contacts, parking, shot ideas…">${esc(p.notes)}</textarea></div>
    </div>
    <div class="form-h"><span class="grow">Reminders</span></div>
    <div class="form"><div class="field"><span class="lbl" style="width:auto;flex:1">Use my default reminders</span><button class="toggle ${own ? '' : 'on'}" data-act="p-own-rem" aria-label="Use defaults"></button></div></div>
    ${own ? remEditor(p.reminders, 'p') : `<p class="hint" style="margin-top:-8px">${rems.length ? rems.map(r => `${C.leadText(r.days)} at ${C.fmtTime(r.time)}`).join(' · ') : 'No default reminders set.'} <button class="btn ghost small" data-act="tab" data-tab="settings" style="height:auto;padding:0">Change defaults</button></p>`}
    ${p.status === 'wrapped' || p.status === 'cancelled' ? `<p class="hint">${C.STATUS[p.status].name} shoots don't send reminders.</p>` : ''}
    <div class="chips" style="margin-top:8px">
      <button class="btn small" data-act="p-preview">${I.bell}Preview reminder</button>
      <button class="btn small" data-act="p-ics">Add to Calendar</button>
      <button class="btn small" data-act="p-dup">Duplicate</button>
      <button class="btn small danger hold" data-hold="p-del">Hold to delete</button>
    </div>`;
}

function projectGear(p) {
  const mode = sheetState.mode || (p.end < C.today() || p.status === 'wrapped' ? 'return' : 'pack');
  const key = mode === 'pack' ? 'packed' : 'returned';
  const rows = p.gear.map(g => ({ g, it: item(g.item) })).filter(x => x.it);
  const total = rows.length + (mode === 'pack' ? p.extras.length : 0);
  const done = rows.filter(x => x.g[key]).length + (mode === 'pack' ? p.extras.filter(x => x.packed).length : 0);
  const clashes = C.conflicts(S, p);
  const groups = C.CATEGORIES.map(cat => {
    const list = rows.filter(x => x.it.category === cat).sort((a, b) => a.it.name.localeCompare(b.it.name));
    if (!list.length) return '';
    return `<div class="cat-h">${cat} <span class="n">${list.filter(x => x.g[key]).length}/${list.length}</span></div><div class="list">${list.map(({ g, it }) => {
      const clash = clashes.find(c => c.item.id === it.id);
      return `<div class="row ${g[key] ? 'done' : ''}">
        <button class="check ${g[key] ? 'on' : ''}" data-act="pg-check" data-id="${it.id}" aria-label="${mode === 'pack' ? 'Packed' : 'Returned'}">${I.tick}</button>
        <button class="grow" style="text-align:left" data-act="pg-check" data-id="${it.id}"><div class="t">${esc(it.name)}</div>
          <div class="s">${esc([it.serial && 'SN ' + it.serial, it.tracked && 'Tracked', it.condition !== 'ok' && C.CONDITION[it.condition], clash && `Also on ${clash.other.title} (${C.fmtRange(clash.other)})`].filter(Boolean).join(' · ') || ' ')}</div></button>
        ${it.qty > 1 || g.qty > 1 ? `<span class="stepper"><button data-act="pg-qty" data-id="${it.id}" data-d="-1">−</button><span>${g.qty}</span><button data-act="pg-qty" data-id="${it.id}" data-d="1">+</button></span>` : ''}
        ${clash ? `<span class="tag warn">Clash</span>` : ''}
        <button class="x icon-btn" style="width:32px;height:32px;background:none;color:var(--muted)" data-act="pg-del" data-id="${it.id}" aria-label="Remove">${I.x}</button>
      </div>`;
    }).join('')}</div>`;
  }).join('');
  const extras = p.extras.length ? `<div class="cat-h">Also bring <span class="n">${p.extras.filter(x => x.packed).length}/${p.extras.length}</span></div><div class="list">${p.extras.map(x => `
    <div class="row ${x.packed ? 'done' : ''}">
      <button class="check ${x.packed ? 'on' : ''}" data-act="px-check" data-id="${x.id}" ${mode === 'return' ? 'disabled style="opacity:.4"' : ''}>${I.tick}</button>
      <button class="grow" style="text-align:left" data-act="px-check" data-id="${x.id}" ${mode === 'return' ? 'disabled' : ''}><div class="t">${esc(x.name)}${x.qty > 1 ? ` <span class="qty">×${x.qty}</span>` : ''}</div></button>
      <button class="x icon-btn" style="width:32px;height:32px;background:none;color:var(--muted)" data-act="px-del" data-id="${x.id}" aria-label="Remove">${I.x}</button>
    </div>`).join('')}</div>` : '';
  const pct = total ? Math.round(done / total * 100) : 0;
  return `
    <div class="pack-head">
      <div class="grow"><div class="big">${total ? `${done} of ${total} ${mode === 'pack' ? 'packed' : 'back'}` : 'No gear yet'}</div>
        <div class="progress"><div style="width:${pct}%"></div></div></div>
      <div class="seg"><button data-act="pmode" data-v="pack" class="${mode === 'pack' ? 'on' : ''}">Pack</button><button data-act="pmode" data-v="return" class="${mode === 'return' ? 'on' : ''}">Wrap check</button></div>
    </div>
    <p class="hint" style="margin:4px 4px 12px">${mode === 'pack' ? 'Tick each piece as it goes in the bag. Tracked pieces are checked out to this shoot.' : 'At wrap, tick each piece as it comes back so nothing is left on set. Tracked pieces are checked back in.'}</p>
    ${clashes.length ? `<div class="banner warn">${I.warn}<span class="grow">${plural(new Set(clashes.map(c => c.item.id)).size, 'tracked piece')} also booked on another shoot these days.</span></div>` : ''}
    <div class="chips" style="margin-bottom:4px">
      <button class="btn primary small" data-act="pick">${I.plus}Add gear</button>
      <button class="btn small" data-act="px-add">${I.plus}Other item</button>
      ${rows.length ? `<button class="btn small" data-act="p-kit">Save as kit</button>` : ''}
      ${done ? `<button class="btn small" data-act="p-reset">Untick all</button>` : ''}
    </div>
    ${groups}${extras}
    ${!total ? `<div class="empty">Add pieces from your gear list or a whole kit.</div>` : ''}`;
}

// ----- gear item -----

function gearSheet() {
  const g = item(sheetState.id);
  if (!g) { setTimeout(closeSheet); return ''; }
  const on = S.projects.filter(p => p.gear.some(x => x.item === g.id)).sort((a, b) => b.start.localeCompare(a.start));
  const w = C.whereIs(S, g);
  return `<div class="sh-head"><button class="btn ghost" data-act="close">Done</button><h3>${esc(g.name) || 'New gear'}</h3><span style="width:72px"></span></div>
    <div class="sh-scroll">
      <div class="form">
        <div class="field"><label>Name</label><input value="${esc(g.name)}" data-gf="name" placeholder="Sony FX3" autocomplete="off"></div>
        <div class="field"><label>Category</label><select data-gf="category">${C.CATEGORIES.map(c => `<option ${g.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Serial</label><input value="${esc(g.serial)}" data-gf="serial" placeholder="Optional" autocomplete="off" autocapitalize="characters"></div>
        <div class="field"><label>How many</label><input type="number" inputmode="numeric" min="1" value="${g.qty}" data-gf="qty"></div>
        <div class="field"><label>Value ($)</label><input type="number" inputmode="decimal" min="0" value="${g.value || ''}" data-gf="value" placeholder="For insurance"></div>
        <div class="field"><label>Condition</label><select data-gf="condition">${Object.entries(C.CONDITION).map(([k, v]) => `<option value="${k}" ${g.condition === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="form"><div class="field"><span class="lbl" style="width:auto;flex:1">Track this piece</span><button class="toggle ${g.tracked ? 'on' : ''}" data-act="g-tracked" aria-label="Track"></button></div></div>
      <p class="hint">Tracked pieces show whether they're in or out, keep a check-out history, and warn you when they're booked on two shoots at once.</p>
      <div class="form"><div class="field"><span class="lbl" style="width:auto;flex:1">Rental</span><button class="toggle ${g.rental ? 'on' : ''}" data-act="g-rental" aria-label="Rental"></button></div>
        ${g.rental ? `<div class="field"><label>Rented from</label><input value="${esc(g.rentalFrom)}" data-gf="rentalFrom" placeholder="Rental house" autocomplete="off"></div>
        <div class="field"><label>Return by</label><input type="date" value="${g.returnBy}" data-gf="returnBy"></div>` : ''}</div>
      <div class="form"><div class="field tall"><label>Notes</label><textarea data-gf="notes" placeholder="Firmware, quirks, what's in the case…">${esc(g.notes)}</textarea></div></div>
      ${g.tracked ? `<div class="form-h">Where it is</div><div class="form"><div class="field" style="padding:12px 14px"><span style="flex:1">${w.state === 'out' ? `Checked out${w.project ? ` to <b>${esc(w.project.title)}</b>` : ''} ${w.at ? '· ' + C.fmtDate(C.ymd(new Date(w.at))) : ''}` : 'In the kit'}</span>
        <span class="end"><button class="btn small" data-act="g-toggle-out">${w.state === 'out' ? 'Check in' : 'Mark out'}</button></span></div>
        ${g.log.slice(-6).reverse().map(e => { const p = proj(e.project); return `<div class="field log-row" style="min-height:40px"><span class="muted" style="width:110px">${C.fmtDate(C.ymd(new Date(e.at)), { noWeekday: true })}</span><span>${e.kind === 'out' ? 'Out' : 'In'}${p ? ' · ' + esc(p.title) : ''}${e.note ? ' · ' + esc(e.note) : ''}</span></div>`; }).join('')}
      </div>` : ''}
      <div class="form-h">Shoots</div>
      ${on.length ? `<div class="list">${on.map(p => `<button class="row" data-act="open-from-gear" data-id="${p.id}"><span class="color-dot" style="--c:${p.color}"></span><span class="grow"><div class="t">${esc(p.title)}</div><div class="s">${C.fmtRange(p)}</div></span><span class="chev">${I.chev}</span></button>`).join('')}</div>` : `<p class="hint" style="margin-top:0">Not on any shoot yet.</p>`}
      <div style="margin-top:20px"><button class="btn small danger hold" data-hold="g-del">Hold to delete</button></div>
    </div>`;
}

// ----- kit -----

function kitSheet() {
  const k = kit(sheetState.id);
  if (!k) { setTimeout(closeSheet); return ''; }
  const items = k.items.map(item).filter(Boolean);
  return `<div class="sh-head"><button class="btn ghost" data-act="close">Done</button><h3>Kit</h3><span style="width:72px"></span></div>
    <div class="sh-scroll">
      <div class="form"><div class="field"><label>Name</label><input value="${esc(k.name)}" data-kf="name" placeholder="A-cam package" autocomplete="off"></div></div>
      <div class="form-h"><span class="grow">${plural(items.length, 'piece')}</span><button class="btn small" data-act="pick-kit">${I.plus}Add</button></div>
      ${items.length ? `<div class="list">${items.map(g => `<div class="row"><span class="grow"><div class="t">${esc(g.name)}</div><div class="s">${g.category}${g.serial ? ' · SN ' + esc(g.serial) : ''}</div></span><button class="x icon-btn" style="width:32px;height:32px;background:none;color:var(--muted)" data-act="kit-del-item" data-id="${g.id}">${I.x}</button></div>`).join('')}</div>` : `<div class="empty">Add the pieces that travel together.</div>`}
      <div style="margin-top:20px"><button class="btn small danger hold" data-hold="kit-del">Hold to delete kit</button></div>
    </div>`;
}

// ----- picker: add gear to a shoot or a kit -----

function pickSheet() {
  const st = sheetState;
  const target = st.target === 'kit' ? kit(st.id) : proj(st.id);
  if (!target) { setTimeout(closeSheet); return ''; }
  return `<div class="sh-head"><span style="width:72px"></span><h3>Add to ${esc(st.target === 'kit' ? target.name || 'kit' : target.title)}</h3><button class="btn ghost" data-act="close">Done</button></div>
    <div class="sh-scroll">
      <div class="search">${I.search}<input id="pick-q" type="search" placeholder="Search gear" value="${esc(st.q || '')}" autocomplete="off"></div>
      <div id="pick-rows">${pickRows()}</div>
    </div>`;
}

function pickRows() {
  const st = sheetState;
  const target = st.target === 'kit' ? kit(st.id) : proj(st.id);
  const has = id => st.target === 'kit' ? target.items.includes(id) : target.gear.some(g => g.item === id);
  const q = (st.q || '').trim().toLowerCase();
  const list = S.gear.filter(g => !q || `${g.name} ${g.serial} ${g.category}`.toLowerCase().includes(q));
  const kits = st.target === 'kit' ? '' : S.kits.filter(k => !q || k.name.toLowerCase().includes(q)).map(k => {
    const all = k.items.length && k.items.every(has);
    return `<button class="row pick-row" data-act="pick-kit-add" data-id="${k.id}"><span class="check ${all ? 'on' : ''}">${I.tick}</span><span class="grow"><div class="t">${esc(k.name)}</div><div class="s">Kit · ${plural(k.items.length, 'piece')}</div></span></button>`;
  }).join('');
  const groups = C.CATEGORIES.map(cat => {
    const rows = list.filter(g => g.category === cat).sort((a, b) => a.name.localeCompare(b.name));
    if (!rows.length) return '';
    return `<div class="cat-h">${cat}</div><div class="list">${rows.map(g => `<button class="row pick-row" data-act="pick-toggle" data-id="${g.id}"><span class="check ${has(g.id) ? 'on' : ''}">${I.tick}</span><span class="grow"><div class="t">${esc(g.name)}${g.qty > 1 ? ` <span class="qty">×${g.qty}</span>` : ''}</div><div class="s">${esc([g.serial && 'SN ' + g.serial, g.tracked && 'Tracked', g.rental && 'Rental'].filter(Boolean).join(' · ') || ' ')}</div></span></button>`).join('')}</div>`;
  }).join('');
  return `${kits ? `<div class="cat-h">Kits</div><div class="list">${kits}</div>` : ''}${groups || (S.gear.length ? '<div class="empty">Nothing matches.</div>' : '')}
    <div style="margin-top:16px"><button class="btn" data-act="pick-new-gear">${I.plus}New gear${q ? ` “${esc(st.q.trim())}”` : ''}</button></div>`;
}

// ---------- actions ----------

function newShoot(date) {
  const p = C.normProject({ id: C.uid(), title: '', start: date || ui.sel, color: C.COLORS[S.projects.length % C.COLORS.length], created: now() });
  p.title = '';
  S.projects.push(p);
  commit();
  openSheet({ kind: 'project', id: p.id, tab: 'details' });
  render();
  setTimeout(() => sheetBody.querySelector('.t-in')?.focus(), 50);
}

function newGear(name = '', back = null) {
  const g = C.normGear({ id: C.uid(), name: name || 'New gear', category: 'Camera' });
  if (!name) g.name = '';
  S.gear.push(g);
  commit();
  openSheet({ kind: 'gear', id: g.id, back });
  setTimeout(() => { const i = sheetBody.querySelector('[data-gf=name]'); if (i && !name) i.focus(); }, 50);
}

function logTracked(it, kind, p, note = '') {
  if (!it.tracked) return;
  it.log.push({ at: now(), project: p ? p.id : '', kind, note });
  if (it.log.length > 200) it.log.shift();
}

function remList(scope) {
  if (scope === 'defaults') return S.settings.reminders;
  return proj(sheetState.id).reminders;
}
function setRemList(scope, list) {
  const clean = C.normReminders(list);
  if (scope === 'defaults') S.settings.reminders = clean; else proj(sheetState.id).reminders = clean;
  commit();
  scope === 'defaults' ? render() : renderSheet();
}

function selectDate(date) {
  ui.sel = date;
  const d = C.parse(date);
  ui.y = d.getFullYear(); ui.m = d.getMonth();
}

function openProject(id, tab = 'gear') {
  const p = proj(id);
  if (!p) return;
  selectDate(p.start);
  ui.tab = 'cal';
  render();
  openSheet({ kind: 'project', id, tab });
}

const ACT = {
  tab: el => { ui.tab = el.dataset.tab; if (sheetState) { sheetState = null; sheet.classList.add('hidden'); } render(); },
  day: el => { ui.sel = el.dataset.date; const d = C.parse(ui.sel); if (d.getMonth() !== ui.m) { ui.y = d.getFullYear(); ui.m = d.getMonth(); } render(); },
  month: el => { ui.m += +el.dataset.d; if (ui.m < 0) { ui.m = 11; ui.y--; } if (ui.m > 11) { ui.m = 0; ui.y++; } render(); },
  today: () => { selectDate(C.today()); render(); },
  new: () => newShoot(),
  open: el => openSheet({ kind: 'project', id: el.dataset.id, tab: 'gear' }),
  'open-from-gear': el => openSheet({ kind: 'project', id: el.dataset.id, tab: 'gear', back: { ...sheetState } }),
  close: () => closeSheet(),
  'shoots-seg': el => { ui.shoots = el.dataset.v; render(); },
  'gear-view': el => { ui.gearView = el.dataset.v; render(); },
  'gear-filter': el => { ui.gearFilter = el.dataset.v; render(); },
  'new-gear': () => newGear(),
  'open-gear': el => openSheet({ kind: 'gear', id: el.dataset.id }),
  'new-kit': () => { const k = { id: C.uid(), name: '', items: [] }; S.kits.push(k); commit(); ui.gearView = 'kits'; render(); openSheet({ kind: 'kit', id: k.id }); setTimeout(() => sheetBody.querySelector('[data-kf=name]')?.focus(), 50); },
  'open-kit': el => openSheet({ kind: 'kit', id: el.dataset.id }),
  'week-start': el => { S.settings.weekStart = +el.dataset.v; commit(); render(); },

  // reminders
  'rem-add': el => { const l = [...remList(el.dataset.scope)]; l.push({ days: +el.dataset.days, time: el.dataset.days === '0' ? '07:00' : '09:00', note: '' }); setRemList(el.dataset.scope, l); },
  'rem-del': el => { const l = [...remList(el.dataset.scope)]; l.splice(+el.dataset.i, 1); setRemList(el.dataset.scope, l); },
  'rem-days': el => { const l = remList(el.dataset.scope).map(r => ({ ...r })); const r = l[+el.dataset.i]; r.days = Math.max(0, Math.min(365, r.days + +el.dataset.d)); setRemList(el.dataset.scope, l); },
  'push-on': async () => {
    try { ui.push = await Push.enable(S); toast(ui.push.state === 'on' ? 'Reminders are on' : 'Notifications weren\'t allowed'); }
    catch (e) { toast('Couldn\'t reach the reminder service. Try again in a moment.'); }
    render();
  },
  'push-off': async () => { ui.push = await Push.disable(); render(); toast('Reminders are off'); },
  'push-test': async () => { try { await Push.ping(); toast('Test sent. It should arrive in a few seconds.'); } catch { toast('Test failed. Try turning reminders off and on.'); } },

  // project
  ptab: el => { sheetState.tab = el.dataset.v; renderSheet(true); },
  pmode: el => { sheetState.mode = el.dataset.v; renderSheet(); },
  pcolor: el => { proj(sheetState.id).color = el.dataset.v; commit(); renderSheet(); render(); },
  'p-own-rem': () => { const p = proj(sheetState.id); p.reminders = p.reminders === null ? S.settings.reminders.map(r => ({ ...r })) : null; commit(); renderSheet(); },
  'p-preview': async () => {
    const p = proj(sheetState.id);
    const r = C.remindersFor(S, p)[0] || { days: 1, note: '' };
    await mirror(S);
    if (await Push.preview(p.id, r.days, r.note)) return;
    const n = C.notice(S, p, r.days, r.note);
    alert(`${n.title}\n\n${n.body}\n\n(Turn on reminders in Settings to get these as notifications.)`);
  },
  'p-ics': () => { const p = proj(sheetState.id); deliverFile(`${(p.title || 'shoot').replace(/[^\w -]+/g, '').trim() || 'shoot'}.ics`, C.ics(S, [p]), 'text/calendar'); },
  'p-dup': () => {
    const p = proj(sheetState.id);
    const q = C.normProject({ ...JSON.parse(JSON.stringify(p)), id: C.uid(), title: p.title + ' (copy)', created: now() });
    q.gear.forEach(g => { g.packed = false; g.returned = false; }); q.extras.forEach(x => { x.packed = false; });
    S.projects.push(q); commit(); render(); openSheet({ kind: 'project', id: q.id, tab: 'details' }); toast('Duplicated. Set the new dates.');
  },
  'pg-check': el => {
    const p = proj(sheetState.id);
    const mode = sheetState.mode || (p.end < C.today() || p.status === 'wrapped' ? 'return' : 'pack');
    const key = mode === 'pack' ? 'packed' : 'returned';
    const g = p.gear.find(x => x.item === el.dataset.id); const it = item(el.dataset.id);
    g[key] = !g[key];
    if (mode === 'pack') logTracked(it, g.packed ? 'out' : 'in', p, g.packed ? '' : 'unpacked');
    else logTracked(it, g.returned ? 'in' : 'out', p);
    commit(); renderSheet(); render();
  },
  'pg-qty': el => { const g = proj(sheetState.id).gear.find(x => x.item === el.dataset.id); g.qty = Math.max(1, Math.min(999, g.qty + +el.dataset.d)); commit(); renderSheet(); },
  'pg-del': el => { const p = proj(sheetState.id); p.gear = p.gear.filter(x => x.item !== el.dataset.id); commit(); renderSheet(); render(); },
  'px-add': () => { const name = prompt('Other item to bring (not in your gear list)'); if (!name || !name.trim()) return; proj(sheetState.id).extras.push({ id: C.uid(), name: name.trim().slice(0, 120), qty: 1, packed: false }); commit(); renderSheet(); render(); },
  'px-check': el => { const x = proj(sheetState.id).extras.find(e => e.id === el.dataset.id); x.packed = !x.packed; commit(); renderSheet(); render(); },
  'px-del': el => { const p = proj(sheetState.id); p.extras = p.extras.filter(x => x.id !== el.dataset.id); commit(); renderSheet(); render(); },
  'p-reset': () => {
    const p = proj(sheetState.id);
    const mode = sheetState.mode || (p.end < C.today() || p.status === 'wrapped' ? 'return' : 'pack');
    if (mode === 'pack') { p.gear.forEach(g => { if (g.packed) logTracked(item(g.item), 'in', p, 'unpacked'); g.packed = false; }); p.extras.forEach(x => { x.packed = false; }); }
    else p.gear.forEach(g => { g.returned = false; });
    commit(); renderSheet(); render();
  },
  'p-kit': () => {
    const p = proj(sheetState.id);
    const name = prompt('Name this kit', p.title ? `${p.title} kit` : 'New kit');
    if (!name || !name.trim()) return;
    S.kits.push({ id: C.uid(), name: name.trim().slice(0, 80), items: p.gear.map(g => g.item) });
    commit(); toast(`Saved kit “${name.trim()}”`);
  },
  pick: () => openSheet({ kind: 'pick', target: 'project', id: sheetState.id, q: '', back: { ...sheetState } }),
  'pick-kit': () => openSheet({ kind: 'pick', target: 'kit', id: sheetState.id, q: '', back: { ...sheetState } }),
  'pick-toggle': el => {
    const st = sheetState; const id = el.dataset.id;
    if (st.target === 'kit') { const k = kit(st.id); k.items = k.items.includes(id) ? k.items.filter(x => x !== id) : [...k.items, id]; }
    else { const p = proj(st.id); p.gear = p.gear.some(g => g.item === id) ? p.gear.filter(g => g.item !== id) : [...p.gear, { item: id, qty: 1, packed: false, returned: false }]; }
    commit(); document.getElementById('pick-rows').innerHTML = pickRows();
  },
  'pick-kit-add': el => {
    const p = proj(sheetState.id); const k = kit(el.dataset.id);
    const all = k.items.every(id => p.gear.some(g => g.item === id));
    if (all) p.gear = p.gear.filter(g => !k.items.includes(g.item));
    else k.items.forEach(id => { if (!p.gear.some(g => g.item === id)) p.gear.push({ item: id, qty: 1, packed: false, returned: false }); });
    commit(); document.getElementById('pick-rows').innerHTML = pickRows();
    toast(all ? `Removed ${k.name}` : `Added ${k.name}`);
  },
  'pick-new-gear': () => {
    const st = { ...sheetState };
    const g = C.normGear({ id: C.uid(), name: (st.q || '').trim() || 'New gear', category: 'Camera' });
    S.gear.push(g);
    if (st.target === 'kit') kit(st.id).items.push(g.id); else proj(st.id).gear.push({ item: g.id, qty: 1, packed: false, returned: false });
    commit();
    openSheet({ kind: 'gear', id: g.id, back: st });
    if (!(st.q || '').trim()) { g.name = ''; renderSheet(true); }
    setTimeout(() => sheetBody.querySelector('[data-gf=name]')?.focus(), 50);
  },

  // gear item
  'g-tracked': () => { const g = item(sheetState.id); g.tracked = !g.tracked; commit(); renderSheet(); },
  'g-rental': () => { const g = item(sheetState.id); g.rental = !g.rental; commit(); renderSheet(); },
  'g-toggle-out': () => { const g = item(sheetState.id); const w = C.whereIs(S, g); g.log.push({ at: now(), project: '', kind: w.state === 'out' ? 'in' : 'out', note: 'by hand' }); commit(); renderSheet(); },
  'kit-del-item': el => { const k = kit(sheetState.id); k.items = k.items.filter(x => x !== el.dataset.id); commit(); renderSheet(); },

  // data
  backup: () => deliverFile(`Slate backup ${C.today()}.json`, JSON.stringify(S, null, 1), 'application/json'),
  'export-csv': () => deliverFile(`Slate gear list ${C.today()}.csv`, C.gearCSV(S), 'text/csv'),
  'export-ics': () => { const list = C.upcoming(S); if (!list.length) return toast('No upcoming shoots'); deliverFile('Slate shoots.ics', C.ics(S, list), 'text/calendar'); },
  sample: () => { S = C.normalize(sample()); commit(); ui.tab = 'cal'; render(); toast('Example data loaded'); },
};

const HOLD = {
  'p-del': () => { S.projects = S.projects.filter(p => p.id !== sheetState.id); commit(); sheetState.back = null; closeSheet(); toast('Shoot deleted'); },
  'g-del': () => {
    const id = sheetState.id;
    S.gear = S.gear.filter(g => g.id !== id);
    S.projects.forEach(p => { p.gear = p.gear.filter(g => g.item !== id); });
    S.kits.forEach(k => { k.items = k.items.filter(x => x !== id); });
    commit(); closeSheet(); toast('Gear deleted');
  },
  'kit-del': () => { S.kits = S.kits.filter(k => k.id !== sheetState.id); commit(); closeSheet(); toast('Kit deleted'); },
};

// ---------- events ----------

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

// Hold-to-confirm for anything that removes data.
let holdT = null;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-hold]');
  if (!el) return;
  el.classList.add('holding');
  holdT = setTimeout(() => { el.classList.remove('holding'); HOLD[el.dataset.hold]?.(); }, 800);
});
const cancelHold = () => { clearTimeout(holdT); document.querySelectorAll('.holding').forEach(x => x.classList.remove('holding')); };
document.addEventListener('pointerup', cancelHold);
document.addEventListener('pointercancel', cancelHold);
document.addEventListener('click', e => { if (e.target.closest('[data-hold]') && !e.target.closest('.holding')) toast('Press and hold to delete'); });

// Typing: save as you go; re-render only what doesn't hold focus.
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'gear-q') { ui.gearQ = el.value; document.getElementById('gear-rows').innerHTML = gearRows(); return; }
  if (el.id === 'pick-q') { sheetState.q = el.value; document.getElementById('pick-rows').innerHTML = pickRows(); return; }
  const text = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['date', 'time', 'number'].includes(el.type));
  if (!text) return;
  if (el.dataset.pf) { proj(sheetState.id)[el.dataset.pf] = el.value.slice(0, el.dataset.pf === 'notes' ? 5000 : 200); commit(); render(); }
  else if (el.dataset.gf) { item(sheetState.id)[el.dataset.gf] = el.value.slice(0, 2000); commit(); if (el.dataset.gf === 'name') sheetBody.querySelector('.sh-head h3').textContent = el.value || 'New gear'; }
  else if (el.dataset.kf) { kit(sheetState.id).name = el.value.slice(0, 80); commit(); }
  else if (el.dataset.rem === 'note') { const l = remList(el.dataset.scope); l[+el.dataset.i].note = el.value.slice(0, 80); commit(); }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'restore') return restore(el);
  if (el.dataset.pf) {
    const p = proj(sheetState.id); const f = el.dataset.pf;
    if (f === 'start') { if (!C.validDate(el.value)) return renderSheet(); const len = C.daysBetween(p.start, p.end); p.start = el.value; p.end = C.addDays(el.value, len); selectDate(p.start); }
    else if (f === 'end') { p.end = C.validDate(el.value) && el.value >= p.start ? el.value : p.start; }
    else if (f === 'call') p.call = C.validTime(el.value) ? el.value : '';
    else if (f === 'status') p.status = el.value;
    else if (f === 'title' && !el.value.trim()) p.title = 'Untitled shoot';
    commit(); renderSheet(); render();
  } else if (el.dataset.gf) {
    const g = item(sheetState.id); const f = el.dataset.gf;
    if (f === 'qty') g.qty = Math.max(1, Math.min(999, Math.round(+el.value) || 1));
    else if (f === 'value') g.value = Math.max(0, Math.round(+el.value) || 0);
    else if (f === 'returnBy') g.returnBy = C.validDate(el.value) ? el.value : '';
    else if (f === 'category' || f === 'condition') g[f] = el.value;
    else if (f === 'name' && !el.value.trim()) g.name = 'Unnamed gear';
    commit(); renderSheet();
  } else if (el.dataset.kf) { if (!el.value.trim()) { kit(sheetState.id).name = 'Kit'; commit(); renderSheet(); } }
  else if (el.dataset.rem === 'time') {
    const l = remList(el.dataset.scope).map(r => ({ ...r }));
    l[+el.dataset.i].time = C.validTime(el.value) ? el.value : '09:00';
    setRemList(el.dataset.scope, l);
  }
});

async function restore(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.projects)) throw new Error('not a backup');
    const next = C.normalize(data);
    if (!confirm(`Replace what's on this device with this backup?\n\n${plural(next.projects.length, 'shoot')}, ${plural(next.gear.length, 'piece')} of gear, ${plural(next.kits.length, 'kit')}.`)) return;
    S = next; commit(); render(); toast('Backup restored');
  } catch { toast('That file isn\'t a Slate backup'); }
}

// Deep links (from a reminder): #project/<id>/gear
function route() {
  const m = /^#project\/([^/]+)(?:\/(gear|details))?/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  openProject(m[1], m[2] || 'gear');
}
addEventListener('hashchange', route);
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data && e.data.type === 'open') { const u = new URL(e.data.url); location.hash = u.hash; route(); }
});

let lastW = innerWidth;
addEventListener('resize', () => {
  // Layout breakpoints change the calendar's markup; re-render when crossing one.
  const band = w => (w >= 1100 ? 2 : w >= 700 ? 1 : 0);
  if (band(innerWidth) !== band(lastW)) render();
  lastW = innerWidth;
});

// Coming back to the app: refresh "today", resync reminders.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  S = load();
  ui.push = await Push.status();
  if (ui.push.state === 'on') Push.sync(S).catch(() => {});
  if (sheetState) renderSheet(); render();
});

// ---------- example data ----------

function sample() {
  const t = C.today();
  const g = (id, name, category, more = {}) => ({ id, name, category, ...more });
  return {
    gear: [
      g('fx3', 'Sony FX3', 'Camera', { serial: '5012345', tracked: true, value: 3900 }),
      g('a7s', 'Sony A7S III', 'Camera', { serial: '4409876', tracked: true, value: 3500 }),
      g('2470', 'Sony 24-70mm f/2.8 GM II', 'Lens', { serial: '1823344', tracked: true, value: 2300 }),
      g('35', 'Sigma 35mm f/1.4 Art', 'Lens', { serial: '55123', value: 900 }),
      g('85', 'Sony 85mm f/1.4 GM', 'Lens', { serial: '1877712', value: 1800 }),
      g('fz100', 'NP-FZ100 battery', 'Power', { qty: 8, value: 80 }),
      g('vmount', 'V-mount 98Wh', 'Power', { qty: 4, value: 250 }),
      g('cfa', 'CFexpress A 160GB', 'Media', { qty: 4, value: 300 }),
      g('ssd', 'Samsung T7 2TB', 'Media', { qty: 2, value: 180 }),
      g('ninja', 'Atomos Ninja V+', 'Monitor', { serial: 'NV22019', value: 700 }),
      g('ntg', 'Sennheiser MKE 600', 'Audio', { value: 330 }),
      g('wl', 'Rode Wireless PRO', 'Audio', { serial: 'RWP8812', tracked: true, value: 400 }),
      g('600x', 'Aputure 600x Pro', 'Lighting', { serial: 'AP600X1', value: 1700 }),
      g('tubes', 'Nanlite PavoTube II 15C', 'Lighting', { qty: 4, value: 160 }),
      g('cstand', 'C-stand', 'Grip', { qty: 3, value: 190 }),
      g('tripod', 'Sachtler Ace XL tripod', 'Support', { value: 1100 }),
      g('ronin', 'DJI RS 4 Pro', 'Support', { serial: 'RS4P0091', tracked: true, value: 1100 }),
      g('vnd', 'Variable ND 82mm', 'Filters', { value: 250 }),
      g('komodo', 'RED Komodo 6K', 'Camera', { serial: 'K6K-2231', rental: true, rentalFrom: 'Lensrentals', returnBy: C.addDays(t, 2), tracked: true }),
    ],
    kits: [
      { id: 'kA', name: 'A-cam package', items: ['fx3', '2470', '35', '85', 'fz100', 'cfa', 'ninja', 'vnd', 'tripod'] },
      { id: 'kAud', name: 'Audio bag', items: ['ntg', 'wl'] },
      { id: 'kL', name: 'Small lighting kit', items: ['600x', 'tubes', 'cstand', 'vmount'] },
    ],
    projects: [
      { id: 'p1', title: 'Coffee brand spot', client: 'Northside Roasters', location: 'Studio B, 4th St', start: C.addDays(t, 1), end: C.addDays(t, 2), call: '07:00', color: C.COLORS[0],
        gear: ['fx3', '2470', '35', 'fz100', 'cfa', 'ninja', '600x', 'tubes', 'cstand', 'tripod', 'wl'].map((item, i) => ({ item, packed: i < 5, qty: item === 'fz100' ? 6 : item === 'cfa' ? 3 : item === 'tubes' ? 4 : 1 })), extras: [{ name: 'Gaff tape', packed: true }, { name: 'Sandbags x4' }] },
      { id: 'p2', title: 'Founder interview', client: 'Brightline', location: 'Client office', start: C.addDays(t, 2), call: '09:30', color: C.COLORS[4],
        gear: ['a7s', '85', 'wl', 'ntg', 'tripod'].map(item => ({ item })) },
      { id: 'p3', title: 'Wedding — Rivera', location: 'Old Mill Barn', start: C.addDays(t, 9), call: '13:00', color: C.COLORS[6], status: 'confirmed',
        gear: ['fx3', 'a7s', 'ronin', '35', '85', 'fz100', 'cfa'].map(item => ({ item })), reminders: [{ days: 14, time: '09:00', note: 'Send timeline to couple' }, { days: 3, time: '09:00', note: 'Clean sensors' }, { days: 1, time: '17:00', note: 'Charge everything' }] },
      { id: 'p4', title: 'Music video (hold)', client: 'Low Tide', start: C.addDays(t, 15), end: C.addDays(t, 17), color: C.COLORS[5], status: 'hold' },
      { id: 'p5', title: 'Product stills', client: 'Pace Running', location: 'Home studio', start: C.addDays(t, -5), color: C.COLORS[2], status: 'wrapped',
        gear: ['a7s', '85', '600x'].map(item => ({ item, packed: true, returned: true })) },
    ],
  };
}

// ---------- start ----------

shell();
render();
requestPersistence();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
mirror(S);
Push.status().then(st => { ui.push = st; if (st.state === 'on') Push.sync(S).catch(() => {}); if (ui.tab === 'settings') render(); });
route();
