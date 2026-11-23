# Slate — notes for Claude

- Owner: Noah. Production calendar + per-shoot reminders + gear lists. iPad first (installed PWA), iPhone second.
  Same setup as ~/Claude/Cadence (Ritualist): no build step, no deps, GitHub Pages from main (push = deploy).
- Verify at three sizes: iPad landscape 1180×820 (rail + calendar + side panel), iPad portrait 820×1180
  (rail, agenda under calendar), iPhone 390×844 (bottom tabs, thin bars). Breakpoints 700 / 1100 px.
- All rules live in `js/core.js` (globalThis.Core); run `node --test tests/core.test.mjs worker/test.mjs` after changes.
- Data is localStorage `slate.v1` (projects, gear, kits, settings). Never change its shape without handling it in `Core.normalize`.
- Removing data = hold to confirm. Dark only. Font Figtree (fonts/). Spelling: "color".
- Bump CACHE in sw.js when shipping.
- Reminders: Cloudflare Worker `slate-reminders` + D1 `slate` (Noah's account), https://slate-reminders.noahschmoah.workers.dev,
  cron every minute. Deploy `cd worker && npx wrangler@4 deploy`. The private push key is `push/vapid-private.json`
  (git-ignored, never commit or print it) and the Worker secret VAPID_PRIVATE_JWK. Only opaque keys + times go to the
  Worker; never send titles, clients or gear there.
- Notification tap → `./#project/<id>/gear` (sw.js notificationclick → app.js route()).
- Feature ideas and what other apps do: docs/RESEARCH.md.
- Deleting asks with confirm() and names what goes (header "Delete" on shoot/gear/kit sheets). Noah couldn't find the old hold-to-delete; don't bring it back.
- Weather + sun (js/weather.js): Open-Meteo geocoding + daily forecast (no key, 16 days ahead), cached on the shoot as
  `p.wx` (°C, km/h; shown in °F/mph or °C per Settings) so the service worker can add it to reminders. Sun times are
  computed offline in Core.sunTimes (tested against published tables). Only the place name/coords leave the device.
- QR labels: vendor/qrcode.js (qrcode-generator 1.4.4, MIT) makes them; label text = https://noahwitchell.github.io/slate/#gear/<id>.
  js/scanner.js reads them (native BarcodeDetector, else vendored barcode-detector + zxing wasm, same as ~/Claude/Intake).
  Scan to pack/return ticks and adds pieces on a shoot. Camera is blocked in Claude's browser pane: test scanning on a device.
