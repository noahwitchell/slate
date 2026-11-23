// node --test tests/ : the rules in js/core.js. Runs in the Mac's time zone, like the iPad does.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/core.js';
const C = globalThis.Core;

const base = () => C.normalize({
  gear: [
    { id: 'fx3', name: 'Sony FX3', category: 'Camera', tracked: true, serial: 'S123' },
    { id: 'bat', name: 'NP-FZ100', category: 'Power', qty: 6 },
  ],
  projects: [
    { id: 'a', title: 'Brand film', start: '2026-12-10', end: '2026-12-12', call: '07:00', gear: [{ item: 'fx3' }, { item: 'bat', qty: 4, packed: true }] },
    { id: 'b', title: 'Headshots', start: '2026-12-12', gear: [{ item: 'fx3' }] },
    { id: 'c', title: 'Cancelled thing', start: '2026-12-12', status: 'cancelled', gear: [{ item: 'fx3' }] },
  ],
});

test('normalize repairs bad data and keeps good data', () => {
  const s = C.normalize({ projects: [{ start: 'nope' }, { title: 'x', start: '2026-01-05', end: '2026-01-01', gear: [{ item: 'ghost' }] }], gear: [{ name: '' }] });
  assert.equal(s.projects.length, 1);
  assert.equal(s.projects[0].end, '2026-01-05');
  assert.deepEqual(s.projects[0].gear, []);
  assert.equal(s.projects[0].reminders, null);
  assert.equal(s.gear.length, 0);
  assert.deepEqual(C.normalize(JSON.parse(JSON.stringify(base()))), base());
});

test('reminder lists sort longest lead first and drop duplicates', () => {
  assert.deepEqual(C.normReminders([{ days: 1, time: '18:00' }, { days: 14, time: '09:00' }, { days: 1, time: '18:00' }, { days: 0, time: '25:00' }]),
    [{ days: 14, time: '09:00', note: '' }, { days: 1, time: '18:00', note: '' }, { days: 0, time: '09:00', note: '' }]);
});

test('dates: grid, ranges, spans', () => {
  const g = C.monthGrid(2026, 11, 0); // December 2026 starts on a Tuesday
  assert.equal(g.length, 42);
  assert.equal(g[0].date, '2026-11-29');
  assert.equal(g[2].date, '2026-12-01');
  assert.equal(C.monthGrid(2026, 11, 1)[0].date, '2026-11-30');
  assert.equal(C.daysBetween('2026-03-07', '2026-03-09'), 2); // across the DST change
  assert.equal(C.fmtRange({ start: '2026-12-10', end: '2026-12-12' }), 'Thu, Dec 10 – 12');
  assert.equal(C.fmtTime('07:00'), '7 AM');
  assert.equal(C.fmtTime('18:30'), '6:30 PM');
  assert.equal(C.leadText(14), '2 weeks before');
});

test('week bars give overlapping projects their own lanes', () => {
  const s = base();
  const week = Array.from({ length: 7 }, (_, i) => C.addDays('2026-12-06', i));
  const bars = C.weekBars(s, week);
  assert.equal(bars.length, 2); // cancelled one left off
  const a = bars.find(b => b.p.id === 'a'), b = bars.find(b => b.p.id === 'b');
  assert.deepEqual([a.col, a.span, a.lane], [4, 3, 0]);
  assert.deepEqual([b.col, b.span, b.lane], [6, 1, 1]);
});

test('tracked gear on overlapping live shoots is a conflict', () => {
  const s = base();
  const c = C.conflicts(s, s.projects[0]);
  assert.equal(c.length, 1);
  assert.equal(c[0].other.id, 'b');
  assert.deepEqual(C.packing(s.projects[0]), { total: 2, done: 1 });
});

test('schedule uses project reminders or the defaults, future only', () => {
  const s = base();
  s.settings.reminders = [{ days: 7, time: '09:00' }, { days: 1, time: '18:00' }];
  s.projects[1].reminders = [{ days: 0, time: '06:00' }];
  const now = new Date(2026, 11, 3, 12, 0).getTime(); // Dec 3 noon: the 7-day for Dec 10 passed this morning
  const sch = C.schedule(s, now);
  assert.deepEqual(sch.map(x => x.key), ['a:1:18:00', 'b:0:06:00']);
  assert.equal(sch[0].at, new Date(2026, 11, 9, 18, 0).getTime());
});

test('due finds a reminder for 45 minutes and only once', () => {
  const s = base();
  const fire = new Date(2026, 11, 9, 18, 0).getTime();
  assert.equal(C.due(s, fire - 5 * 60000).length, 0);
  const d = C.due(s, fire + 60000);
  assert.deepEqual(d.map(x => x.key), ['a:1:18:00']);
  assert.equal(C.due(s, fire + 60000, { 'a:1:18:00': 1 }).length, 0);
  assert.equal(C.due(s, fire + 50 * 60000).length, 0);
  const n = C.notice(s, d[0].p, d[0].days, 'Charge batteries');
  assert.equal(n.title, 'Tomorrow: Brand film');
  assert.match(n.body, /1 of 2 packed/);
  assert.match(n.body, /^Charge batteries\n/);
  assert.equal(n.url, './#project/a/gear');
});

test('tracked gear location follows its log', () => {
  const s = base();
  const fx3 = s.gear[0];
  assert.equal(C.whereIs(s, fx3).state, 'in');
  fx3.log.push({ at: 1, project: 'a', kind: 'out' });
  const w = C.whereIs(s, fx3);
  assert.equal(w.state, 'out');
  assert.equal(w.project.title, 'Brand film');
});

test('exports: CSV and calendar alarms', () => {
  const s = base();
  assert.match(C.gearCSV(s).split('\r\n')[1], /^"Sony FX3","Camera","S123"/);
  s.settings.reminders = [{ days: 1, time: '18:00' }];
  const cal = C.ics(s, [s.projects[0]]);
  assert.match(cal, /DTEND;VALUE=DATE:20261213/);
  assert.match(cal, /TRIGGER:-PT360M/); // 18:00 the day before = 6 hours before midnight
});

test('sun times match published tables to a couple of minutes', () => {
  const near = (ms, iso) => assert.ok(Math.abs(ms - Date.parse(iso)) < 3 * 60000, `${new Date(ms).toISOString()} vs ${iso}`);
  const la = C.sunTimes('2026-06-21', 34.05, -118.24);
  near(la.rise, '2026-06-21T12:42:00Z'); // 5:42 AM PDT
  near(la.set, '2026-06-22T03:08:00Z');  // 8:08 PM PDT
  const ny = C.sunTimes('2026-12-21', 40.71, -74.0);
  near(ny.set, '2026-12-21T21:32:00Z');  // 4:32 PM EST
  assert.equal(C.clock(ny.set, 'America/New_York'), '4:31 PM');
  assert.equal(C.sunTimes('2026-06-21', 78.2, 15.6).rise, null); // midnight sun
});

test('forecast parsing, staleness and the reminder weather line', () => {
  const s = base();
  const p = s.projects[0];
  p.place = C.normPlace({ name: 'Austin, Texas', lat: 30.2672, lon: -97.7431, tz: 'America/Chicago' });
  const now = new Date(2026, 11, 3, 12).getTime();
  assert.deepEqual(C.needsForecast(s, now).map(x => x.id), ['a']);
  const days = C.parseForecast({ daily: { time: ['2026-12-10'], weather_code: [61], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [70], wind_speed_10m_max: [20], wind_gusts_10m_max: [50] } });
  p.wx = { at: now, key: C.wxKey(p), days };
  assert.deepEqual(C.needsForecast(s, now + 60000), []);
  assert.equal(C.wxLine(s, p, '2026-12-10'), '🌧️ Rain 68°/50° · 70% rain · gusts 31 mph');
  s.settings.units = 'C';
  assert.equal(C.wxLine(s, p, '2026-12-10'), '🌧️ Rain 20°/10° · 70% rain · gusts 50 km/h');
  p.place = C.normPlace({ name: 'Elsewhere', lat: 1, lon: 1 });
  assert.equal(C.wxLine(s, p, '2026-12-10'), ''); // moved: old forecast no longer applies
  assert.equal(C.normalize(JSON.parse(JSON.stringify(s))).projects[0].place.name, 'Elsewhere');
});

test('scanned codes give back the gear id', () => {
  assert.equal(C.scannedId(C.labelURL('fx3')), 'fx3');
  assert.equal(C.scannedId('https://example.com/whatever'), null);
  assert.equal(C.scannedId('k3x9a1b2'), 'k3x9a1b2');
});
