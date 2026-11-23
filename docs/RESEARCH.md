# Slate: research notes

Research for a personal, iPad-first production-management PWA (month calendar, per-project
reminders, gear inventory with packing checklists). Compiled 2026-11-23 from web sources.
Vendor feature claims come mostly from vendors' own pages or App Store listings; treat them as
marketing-level and re-check before copying a specific behavior.

---

## 0. The constraint that shapes everything: iOS home-screen web apps

| Capability | Status on iOS/iPadOS | Impact on Slate |
|---|---|---|
| Web Push | Since 16.4, **only for apps added to the Home Screen**; permission must be requested from a user tap. Declarative Web Push (no service worker needed to show it) since 18.4. | Reminders work, but only after install + a tap-to-enable flow. |
| Scheduled local notifications | **Not available.** The Notification Triggers API (`showTrigger`/`TimestampTrigger`) never launched in any browser, Safari included. Declarative Web Push still needs a push message to arrive ("sending a push message... works exactly as before"). | **"14/7/3/1 days before at 9:00" needs a server** (cron + VAPID push) that holds the schedule. Pure local-first cannot fire a timed alert while the app is closed. |
| Background Sync / Periodic Sync / Background Fetch | Not supported. | No background refresh of weather, no queued uploads. Sync only while the app is open. |
| Notification tap → deep link | `notificationclick` + `clients.openWindow(url)` works in installed PWAs. | Tapping a reminder can open `/project/<id>/gear`. |
| Storage | Safari 17 gave Home Screen apps the same quota as the browser; `navigator.storage.persist()` is granted on heuristics, including whether the app runs from the Home Screen. Home Screen apps have their own days-of-use counter rather than Safari's 7-day cap, though developers still report occasional data loss. Storage is **not shared** between Safari and the installed app. | Use IndexedDB, call `persist()`, and **ship JSON export/backup** as a v1 safety net. |
| Camera | `getUserMedia` works. | Photos of gear condition and receipts work. |
| Barcode scanning | `BarcodeDetector` is **off by default** in iOS Safari (behind a flag since 17, reportedly broken on 18). | Use a WASM decoder (ZXing / zxing-wasm) for QR or serial barcodes. |
| Badging | Since 16.4 (installed only). | App icon badge = items left to pack or overdue rentals. |
| Wake Lock | Installed PWAs since 18.4. | Keep the screen on during packing / check-in. |
| Share target, public file system | Not supported. Origin-private file system is supported. | Exports go through the share sheet / download, not a folder. |
| Links from Calendar/Mail | Open in Safari, **not** the installed PWA (separate storage). | A `.ics` alarm's URL won't open the app's local data. |

Sources: [firt.dev iOS PWA compatibility](https://firt.dev/notes/pwa-ios/) ·
[WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) ·
[WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/) ·
[WebKit: Safari 18.4 features](https://webkit.org/blog/16574/digital-credentials-api/) ·
[Chrome: Notification Triggers API status](https://developer.chrome.com/docs/web-platform/notification-triggers) ·
[WebKit: Updates to Storage Policy](https://webkit.org/?p=14403) ·
[Apple forum: PWA data persistence](https://developer.apple.com/forums/thread/710157) ·
[caniuse BarcodeDetector](https://caniuse.com/mdn-api_barcodedetector_barcodedetector) ·
[WebKit bug 281848](https://bugs.webkit.org/show_bug.cgi?id=281848) ·
[DEV: barcode scanning on iOS with WASM](https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2) ·
[MagicBell: PWA iOS limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)

**Practical design:** keep data local-first in IndexedDB, but run a tiny push worker (for example a
Cloudflare Worker with a cron trigger) that stores only `{subscription, fireAt, title, url}` for each
reminder. When a project's date or reminder offsets change, the app re-sends that project's
schedule. Fallback for no-server or no-push: an optional `.ics` export with `VALARM`s, so Apple
Calendar fires the alerts. That alert opens Safari, not the app.

---

## 1. BAND's calendar

BAND (NAVER) is a group-communication app. The calendar is a group feature, not a personal planner.
BAND's help center (band.us/cs) blocks automated fetching, so the details below come from the
App Store listing and release notes. Anything marked *unverified* comes from general knowledge of
the app and should be checked in the app itself.

- **Month view + list:** Group calendar with events created from the Home tab; upcoming events
  surface on the home/feed. A "My calendar" view aggregates all bands.
  ([App Store](https://apps.apple.com/us/app/band-app-for-all-groups/id542613198))
- **Event detail / RSVP:** The new calendar (v29, Jul 2026) added per-event RSVP, attendee group
  chats and albums, and sign-up sheets on events. v30 lets non-members RSVP ("Invite External
  Attendees"). ([App Store version notes](https://apps.apple.com/us/app/band-app-for-all-groups/id542613198))
- **Reminders:** "Upcoming schedule reminders" arrive automatically with no setup, plus feed
  reminders for upcoming events and RSVPs (Update 7.1). Push notifications can be toggled per band.
  ([App Store KR](https://apps.apple.com/KR/app/id542613198),
  [BAND blog 7.1](https://medium.com/bandapp/stay-connected-easily-with-update-7-1-706f69aca222))
  *Unverified:* each event offers one or two alert choices from a fixed preset list (at the time, minutes/hours
  before, 1 day, about 1 week). There is no arbitrary list like 14/7/3/1 days at a chosen clock time.
- **Repeat events:** *Unverified.* Standard daily/weekly/monthly/yearly repeats exist. No source found.
- **Colors/categories:** Users can recolor individual events to tell event types apart (App Store
  review). *Unverified:* each band also has its own color in the combined calendar.
- **Sharing/export:** Events can be saved to the iOS Calendar (permission string). The
  export function lives under calendar settings (Update 7.1).
- **Also:** birthday/anniversary tracking, polls.

**What BAND does well:** a clean month grid with colored dots and bars, a tap-a-day agenda list
under the grid, one-tap RSVP with headcount, and the event thread holding discussion and photos.

**Limits relevant here:** reminder lead times are a fixed preset list with few slots, not a custom
countdown series. Reminders are tied to the group event, not to prep tasks. There is no concept of
gear, call time vs. wrap, or multi-day shoot phases. Everything is cloud and account-based.

**Take for Slate:** copy the month grid + selected-day agenda + color per project/client. Beat it on
reminders: any number of offsets (14/7/3/1 days, day-of), each at its own time, each with a purpose
(for example "7 days: confirm rentals", "1 day: charge batteries").

---

## 2. Production tools: what matters on the job

### Production management (team/cloud)

| App | Key features that matter | Notes |
|---|---|---|
| **StudioBinder** | Call sheets that auto-fill weather, nearest hospital and maps; crew confirm without an account, with view and confirm tracking; shot lists with size, type, movement, lens and gear per shot; storyboards; drag-drop shooting schedule; production calendar shared with clients; crew contacts sorted by department, saved crew lists. Has a photoshoot-planning variant. | [studiobinder.com](https://studiobinder.com/) · [call sheets](https://www.studiobinder.com/call-sheet-production/) · [photoshoot](https://studiobinder.com/planning-a-photoshoot) · [scheduling](https://www.studiobinder.com/production-schedule-software/) |
| **Celtx** | Script → breakdown → shooting schedule → call sheets; budgeting and cost reports on higher tiers; schedule export to Google Calendar. | [Celtx production](https://www.celtx.com/product/production/) · [Capterra](https://www.capterra.com/p/235136/Celtx/) |
| **Yamdu** | Database-heavy production management for film, TV and commercials: crew lists, call sheets, breakdowns, department tools. No meaningful free tier. | [TrustRadius](https://www.trustradius.com/compare-products/celtx-vs-yamdu) · [Celtx blog comparison (biased)](https://blog.celtx.com/production-management-software/) |
| **Assemble** | Project hub for video producers: calendars, tasks (reusable), documents/binders, call sheets, creative briefs, vendor management, templates. | [onassemble.com template](https://www.onassemble.com/template-library/feature-film-production-schedule-template) · [No Film School](https://nofilmschool.com/production-document-cloud-workflow-assemble) |
| **SetHero** | Call-sheet specialist: drag-drop builder, contacts, weather forecasts, overtime calculations ("Smart Assist"), crew confirmations. | [G2](https://www.g2.com/products/sethero/features) · [Cinapse integration](https://sethero.com/?p=38907) |
| **Setkeeper** | Secure "production office" for distributing documents: audit logs (who viewed), watermarking, tagging/search, texting crew updates, Google Drive integration. | [setkeeper.com/hub](https://setkeeper.com/hub) · [watermarking](https://setkeeper.com/watermarking) |
| **Shot Lister** (iPad) | Shot-by-shot, minute-by-minute schedule with "Live Mode" on set (tracks running ahead or behind); circle takes; PDF export (Pro); Scriptation import; Dropbox sharing. | [App Store](https://apps.apple.com/app/id529436218) |
| **Movie Magic Scheduling / Gorilla** | Desktop industry-standard stripboard scheduling (EP) and Jungle Software's Gorilla (still sold, about $199/yr desktop). Overkill for a freelancer. | [SourceForge comparison](https://www.sourceforge.net/software/compare/Gorilla-Scheduling-vs-Movie-Magic-Scheduling) · [Capterra Gorilla](https://www.capterra.com/p/10050235/Gorilla-Scheduling/) |
| **Frame.io** | Review/approval plus Camera to Cloud (proxies upload during the take; iPad used as on-set hub). Paid plans only for C2C. Integration target at most. | [frame.io/c2c](https://frame.io/c2c) · [Adobe blog](https://blog.adobe.com/en/publish/2024/11/12/frameios-camera-to-cloud-adds-real-time-photo-video-collaboration) · [PetaPixel](https://petapixel.com/2022/04/21/frame-io-brings-camera-to-cloud-functionality-to-just-about-anyone) |

**Patterns worth stealing:** auto-filled weather, sunrise/sunset and hospital on the shoot day; per-shot
gear on shot lists; reusable templates (crew lists, task lists); "live" behind/ahead tracking;
PDF export of everything.

### Gear / inventory

| App | Key features | Source |
|---|---|---|
| **Cheqroom** | Barcode/QR/RFID check-out and check-in from any device; condition photos and custom fields at handoff; reservations with conflict blocking; pickup and return reminders; scan log for accountability; Google Calendar/Slack. Gaps: can't force a scan, can't delete items. | [features](https://cheqroom.com/features/equipment-checkout-software) · [Capterra](https://www.capterra.com/p/140824/CHEQROOM/) · [App Store](https://apps.apple.com/us/app/-/id589790728) |
| **Sortly** | Folder-nested inventory (kit → case → item), photos, 12 custom-field types, barcode/QR labels printed in-app, low-stock alerts, CSV export. | [custom fields](https://www.sortly.com/features/custom-fields/) · [barcodes](https://www.sortly.com/barcode-inventory-system/) · [review](https://fitsmallbusiness.com/sortly-review/) |
| **Booqable** | Rental business software: hard and soft availability per date range, quotes/contracts/invoices with e-signature, barcode scanning, Google/Apple Calendar sync. | [features](https://booqable.com/features/) · [AV industry](https://cdn1.booqable.com/industries/av) |
| **Gear-inventory apps** (Camera Shelf, CreatorKit Pro, GearGrove, Stowdio, MyGearVault, Shutter Safe) | Serial numbers, receipts vault, insurance value totals and **PDF reports for insurers**, named kits, firmware and maintenance logs, usage counts, stolen-gear registry (MyGearVault), local-only storage (Stowdio). "Kitbag" was not found as a distinct current app. | [Camera Shelf](https://apps.apple.com/us/app/-/id6755641228) · [CreatorKit Pro](https://apps.apple.com/bb/app/creatorkit-pro/id6770836113) · [GearGrove](https://apps.apple.com/app/id6754944208) · [Stowdio](https://apps.apple.com/us/app/-/id6752217727) · [MyGearVault](https://apps.apple.com/us/app/mygearvault/id1106860868) · [Shutter Safe](https://apps.apple.com/us/app/-/id6751868798) |

### Camera-department and scouting tools

| App | What it does | Source |
|---|---|---|
| **pCAM Pro** (de facto "pocket AC") | DoF, FoV, hyperfocal, ND/filter exposure, 1600+ camera formats, reference charts. iPhone/iPad/Mac. A standalone "Pocket AC" app wasn't found. | [App Store](https://apps.apple.com/app/id1308057201) · [StudioDaily review](https://studiodaily.com/2019/03/review-pcam-pro-ios) |
| **Cine Meter II** | Light meter, RGB waveform, false color. | [App Store](https://apps.apple.com/us/app/id846918884) |
| **Artemis / Magic ViewFinder / Cadrage** | Director's viewfinders with camera + lens sims and shot lists. | [Artemis](https://apps.apple.com/app/id1164523253) · [VFX Voice](https://vfxvoice.com/what-apps-do-vfx-supervisors-use/) |
| **Shot Designer** | Overhead camera diagrams + shot list + storyboards. | [App Store](https://apps.apple.com/us/app/shot-designer/id556342711) |
| **Scriptation** | iPad script PDF annotation, transfers notes between revisions. | [scriptation.com](https://scriptation.com/?p=9046) |
| **Sun Seeker** | AR + compass sun path, golden/blue hour, **notifications for golden hour or sun crossing a heading**. | [App Store](https://apps.apple.com/us/app/sun-seeker-sunlight-tracker/id330247123) |
| **Sun Surveyor** | AR sun/moon paths, map planner, shadow length, Milky Way. | [App Store](https://apps.apple.com/us/app/sun-surveyor-lite/id552754407) |
| **PhotoPills** | 2D map planner (sun, moon, Milky Way, shadows, twilights), time bar, AR, saved "plans", widget. iOS only, no browser version. | [App Store](https://apps.apple.com/us/app/photopills/id596026805) · [user guide](https://www.photopills.com/user-guide/night/night-ar) |
| **Helios Pro** | Sun-tracking for scouting and scheduling light. | [British Cinematographer](https://britishcinematographer.co.uk/apps/) |
| **Weather** | Windy (wind and gust maps matter for sound, drones, high rolls), Clime (radar), photo-specific forecasts (Fotocast, Weather Studio). | [Clime blog (vendor)](https://climeradar.com/blog/essential-weather-apps-for-outdoor-filming-with-your-iphone) · [Weather Studio](https://www.producthunt.com/p/weather-studio) |

Data source for Slate: **Open-Meteo** is free for non-commercial use (10k calls/day), needs no key,
supports CORS, and returns hourly temp/precip/wind plus daily sunrise/sunset. It can be called directly from
the PWA. ([GitHub README](https://github.com/open-meteo/open-meteo/blob/main/README.md) · [docs](https://open-meteo.com/en/docs))
Sun position and golden hour can be computed offline with SunCalc (JS) for no network dependency.

### Freelancer invoicing

| App | Relevant bits | Source |
|---|---|---|
| **Crew Call** | Film-crew time tracking + invoices. A reviewer says it struggles with 10- and 12-hour day/OT structures (8 h at 1x, then 1.5x). | [App Store](https://apps.apple.com/us/app/crew-call/id1532198878) |
| **LineItems: For Filmmakers** | Jobs with kit fees, daily or weekly billing. | [App Store](https://apps.apple.com/us/app/lineitems-for-filmmakers/id6738378704) |
| **FreshBooks / Harvest / Everhour** | Day-rate invoice templates, time tracking, line-item separation (crew, kit, locations). | [FreshBooks](https://freshbooks.com/invoice-templates/video-production) · [Harvest](https://www.getharvest.com/invoices/invoice-app-for-video-production) · [Everhour](https://everhour.com/invoices/invoice-app-for-video-production) |
| **Stripe guide** | List kit as its own line (flat kit fee); label owned-equipment usage fees clearly. | [Stripe](https://stripe.com/resources/more/how-do-i-write-an-invoice-for-freelance-film-work) |

---

## 3. Feature ideas, ranked

### (a) Quick wins: fit a local-first personal PWA

1. **Kits/templates** ("A-cam package", "Interview kit"). Build a project's gear list in one tap instead of 30.
2. **Packing checklist with states** (needed → packed → loaded → returned). Mirrors the real flow: shop, truck, set, wrap.
3. **Wrap/check-in pass**, the same list in reverse. Catches the lens cap or card left on set before you drive away.
4. **Condition notes + photo on check-in.** Evidence for damage claims and rental disputes.
5. **Counts for consumables** (batteries 6/8, cards 4 × 256 GB, with "charged"/"offloaded" ticks). Battery and media shortfalls are the most common on-set failure.
6. **Gear conflict detection.** Warn when an item is assigned to two overlapping projects; this is Cheqroom's core value.
7. **Multi-day projects with phases** (prep / travel / shoot / wrap days). Real jobs span days, and reminders should key off the first shoot day.
8. **Purposeful reminder offsets** ("7 days: confirm rentals", "1 day: charge + format"). Turns notifications into a prep timeline. BAND can't do this.
9. **Insurance list export** (CSV/PDF: item, serial, purchase date, value, total). Insurers, carnets and production COIs ask for exactly this.
10. **Serial/asset QR labels + WASM scanner.** Fast check-in and serial lookup. Use ZXing-WASM, since BarcodeDetector is off on iOS.
11. **Rental items with vendor + return date** (shown as calendar items and overdue badge). Late returns cost real money.
12. **.ics export** (single project or all) with optional VALARMs. Puts shoots in Apple/Google Calendar and gives a no-server reminder fallback.
13. **Client + crew contacts on the project** (tap to call/text/email/maps). Everything needed at 5 a.m. on one screen.
14. **Location with map link + call/wrap times.** Basic call-sheet data without building call sheets.
15. **Shoot-day sun times** (SunCalc, offline). Golden hour and sunset drive the schedule for exteriors.
16. **JSON backup/restore** (plus a reminder nag if no backup in N days). Protects against iOS storage eviction.
17. **App icon badge** (unpacked items on the next shoot). A glanceable nudge; works in installed PWAs.
18. **Screen wake lock during packing.** The iPad stays on while you work through a case.

### (b) Bigger features

1. **Weather on the shoot day** (Open-Meteo hourly; wind/gusts, rain probability; refresh when the app opens). Drives go/no-go, rain covers and drone plans.
2. **Shot list per project** (shot, size, lens, movement, gear link, done tick). Ties gear to intent; Shot Lister/StudioBinder pattern.
3. **Simple call sheet** (PDF/share: times, location, parking, weather, sun, hospital, crew). Even solo jobs send one to clients and talent.
4. **Day rate + kit fee invoicing** (rates per client, OT rules, kit line items, mileage, PDF invoice, paid/unpaid). Billing straight from the project avoids retyping.
5. **Mileage log** (start/end or a map distance per project). Tax deduction and billable travel.
6. **Gear history and stats** (days used, last service, sensor clean, firmware). Maintenance timing and depreciation and pricing decisions.
7. **Kit fee calculator from assigned gear** (each item has a day rate). Fair, consistent kit fees.
8. **Availability view** (gear × date heat strip). Spot double-bookings and what's free to rent out.
9. **Conflict detection for people/time** (overlapping projects, travel buffer). Avoids double-booking yourself.
10. **Receipt/warranty vault** (photos/PDFs in OPFS). Insurance and repair claims.

### (c) Need a server or accounts

1. **Timed reminders while the app is closed.** Requires a push server on iOS (no local scheduling). This is v1-critical, so keep it minimal: a cron worker plus VAPID, storing only reminder rows.
2. **Device sync iPad ↔ iPhone.** Separate installs have separate storage; options are a small sync worker (KV/D1), CRDT/replicache-style, or a manual export/import via iCloud Drive as a stopgap.
3. **Subscribable calendar feed** (`webcal://` URL). Apple Calendar auto-updates instead of re-importing .ics.
4. **Share a read-only project/call-sheet link with crew/clients.** StudioBinder-style "confirm without an account".
5. **Crew RSVP/confirmations.** BAND's best feature; needs identities and a backend.
6. **Lend/rent gear to others with check-out records.** Cheqroom/Booqable territory.
7. **Weather/sun alerts** ("rain >60% tomorrow at location"). Needs server-side polling since there is no background fetch.
8. **Cloud backup of photos/receipts.** Survives device loss.
9. **Frame.io / Dropbox hooks** (deliverable links per project). Nice-to-have only.

---

## 4. Recommended order

1. Reminder push worker (thin) + offset list with labels + deep link to gear list (finishes v1 for real on iOS).
2. Kits/templates + packing states + consumable counts + wrap check-in.
3. Gear conflict detection + rental return dates.
4. JSON backup + `persist()` + insurance CSV/PDF export.
5. .ics export; shoot-day sun (offline) and weather (Open-Meteo).
6. Then invoicing/mileage, shot lists, call sheets, and sync.
