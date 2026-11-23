// node --test worker/test.mjs : alert cleaning and the VAPID signature.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cleanAlerts, validEndpoint, vapidHeader } from './index.js';

test('only real push services are accepted', () => {
  assert.ok(validEndpoint('https://web.push.apple.com/QABC'));
  assert.ok(!validEndpoint('https://evil.example.com/push.apple.com'));
  assert.ok(!validEndpoint('http://web.push.apple.com/x'));
});

test('alerts: well-formed, not stale, no repeats', () => {
  const now = 1_800_000_000_000;
  const out = cleanAlerts([
    { k: 'abc:7:09:00', at: now + 1000 },
    { k: 'abc:7:09:00', at: now + 2000 },
    { k: 'old:1:09:00', at: now - 3600000 },
    { k: '<script>', at: now + 1000 },
    { k: 'nan:1:09:00', at: 'x' },
  ], now);
  assert.deepEqual(out.map(a => a.k), ['abc:7:09:00']);
  assert.equal(cleanAlerts('nope'), null);
});

test('VAPID header signs with WebCrypto and verifies against the public key', async () => {
  const jwk = JSON.parse(readFileSync(new URL('../push/vapid-private.json', import.meta.url), 'utf8')).jwk;
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const h = await vapidHeader('https://web.push.apple.com/abc', key, 'PUB');
  const [, t] = /t=([^,]+)/.exec(h);
  const [a, b, s] = t.split('.');
  assert.equal(JSON.parse(Buffer.from(b, 'base64url')).aud, 'https://web.push.apple.com');
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${a}.${b}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});
