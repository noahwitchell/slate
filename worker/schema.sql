-- One row per device with reminders on: only its push address.
CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,          -- SHA-256 of the push endpoint
  sub TEXT NOT NULL,            -- the push subscription JSON
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);

-- The moments a device wants a reminder. `k` is an opaque key made on the device; no shoot details.
CREATE TABLE IF NOT EXISTS alerts (
  sub_id TEXT NOT NULL,
  k TEXT NOT NULL,
  at INTEGER NOT NULL,          -- epoch ms
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sub_id, k)
);
CREATE INDEX IF NOT EXISTS alerts_due ON alerts (sent, at);
