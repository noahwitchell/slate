# Slate

Shoot calendar, reminders and gear lists for video and photo work. iPad first, works on iPhone.
Live at https://noahwitchell.github.io/slate/ (Share → Add to Home Screen).

- **Calendar**: month grid with multi-day shoots as colored bars (striped = on hold), the selected day and
  what's coming up beside it (iPad landscape) or below it (iPad portrait, iPhone).
- **Reminders**: each shoot gets reminders X days before at a time you choose, with a note
  ("7 days: confirm rentals", "1 day: charge batteries"). Defaults live in Settings; any shoot can use its own.
  Tapping a reminder opens that shoot's gear list.
- **Gear lists**: add pieces or whole kits to a shoot, tick them off as you pack, then run a wrap check so
  nothing stays on set. Quantities for batteries and cards, one-off "also bring" items.
- **Tracked gear**: mark key pieces as tracked to see whether they're in or out, keep a check-out history, and get a
  warning when one is booked on two overlapping shoots.
- **Rentals**: rental house and return date, with a banner when one is due or overdue.
- **Exports**: full JSON backup/restore, insurance CSV (serials, values), .ics for the iPad's Calendar.

Data stays on the device (localStorage, mirrored to Cache Storage for the service worker).

## Reminders (web push)

iOS can't schedule a notification from a web app, so a tiny sender in `worker/` (Cloudflare Worker + D1) does it.
Turning reminders on sends it the device's push address and a list of opaque keys and times
(`<shoot id>:<days>:<time>`), nothing else. Every minute it sends an **empty** push to any device with a reminder due;
the service worker works out which shoot it was for from the local data and writes the notification.

## Develop

```bash
python3 -m http.server 5193   # then http://localhost:5193
node --test tests/core.test.mjs worker/test.mjs
```

- `js/core.js` every rule (dates, calendar layout, reminder schedule, conflicts, exports). Classic script shared by the page, the service worker and the tests.
- `js/app.js` screens · `js/store.js` storage · `js/push.js` reminder sign-up · `sw.js` offline cache + push
- `worker/` the reminder sender: `cd worker && npx wrangler@4 deploy`
- `docs/RESEARCH.md` notes on other production apps and feature ideas
- `python3 tools/make_icon.py && zsh tools/render_icons.sh` rebuilds the icons
