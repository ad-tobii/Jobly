import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';

import { isDigestDue } from '../src/utils/digestSchedule.js';

const at = (iso, zone = 'UTC') => DateTime.fromISO(iso, { zone });

const daily = (overrides = {}) => ({
  preferences: { digest_frequency: 'daily', digest_time: '08:00', timezone: 'UTC' },
  last_digest_sent: null,
  ...overrides,
});

// ── daily ─────────────────────────────────────────────────────────────────────
test('daily digest fires exactly at the preferred time', () => {
  assert.equal(isDigestDue(daily(), at('2026-08-02T08:00:00Z')), true);
});

test('daily digest fires inside the 30 minute window', () => {
  assert.equal(isDigestDue(daily(), at('2026-08-02T08:29:00Z')), true);
});

test('daily digest does not fire after the window closes', () => {
  assert.equal(isDigestDue(daily(), at('2026-08-02T08:31:00Z')), false);
});

test('daily digest does not fire before the preferred time', () => {
  assert.equal(isDigestDue(daily(), at('2026-08-02T07:59:00Z')), false);
});

test('daily digest does not re-fire within the same day', () => {
  const user = daily({ last_digest_sent: '2026-08-02T08:00:00Z' });
  assert.equal(isDigestDue(user, at('2026-08-02T08:20:00Z')), false);
});

test('daily digest fires again the next day', () => {
  const user = daily({ last_digest_sent: '2026-08-01T08:05:00Z' });
  assert.equal(isDigestDue(user, at('2026-08-02T08:05:00Z')), true);
});

// ── timezones ─────────────────────────────────────────────────────────────────
test('preferred time is interpreted in the user timezone, not UTC', () => {
  const user = daily({
    preferences: { digest_frequency: 'daily', digest_time: '08:00', timezone: 'Africa/Lagos' },
  });
  // Lagos is UTC+1, so 08:00 local is 07:00Z.
  assert.equal(isDigestDue(user, at('2026-08-02T07:00:00Z')), true);
  assert.equal(isDigestDue(user, at('2026-08-02T08:00:00Z')), false);
});

test('an unknown timezone does not throw or fire', () => {
  const user = daily({
    preferences: { digest_frequency: 'daily', digest_time: '08:00', timezone: 'Not/AZone' },
  });
  assert.equal(isDigestDue(user, at('2026-08-02T08:00:00Z')), false);
});

// ── twice daily ───────────────────────────────────────────────────────────────
test('twice-daily fires at both the preferred time and 12 hours later', () => {
  const user = {
    preferences: { digest_frequency: 'twice_daily', digest_time: '08:00', timezone: 'UTC' },
    last_digest_sent: null,
  };
  assert.equal(isDigestDue(user, at('2026-08-02T08:10:00Z')), true);
  assert.equal(isDigestDue(user, at('2026-08-02T20:10:00Z')), true);
  assert.equal(isDigestDue(user, at('2026-08-02T14:00:00Z')), false);
});

test('twice-daily respects the 11 hour minimum gap', () => {
  const user = {
    preferences: { digest_frequency: 'twice_daily', digest_time: '08:00', timezone: 'UTC' },
    last_digest_sent: '2026-08-02T08:00:00Z',
  };
  assert.equal(isDigestDue(user, at('2026-08-02T20:00:00Z')), true);
  assert.equal(isDigestDue(user, at('2026-08-02T08:20:00Z')), false);
});

// ── weekly ────────────────────────────────────────────────────────────────────
test('weekly defaults to Monday for a user who has never been sent one', () => {
  const user = {
    preferences: { digest_frequency: 'weekly', digest_time: '08:00', timezone: 'UTC' },
    last_digest_sent: null,
  };
  // 2026-08-03 is a Monday; 2026-08-04 a Tuesday.
  assert.equal(isDigestDue(user, at('2026-08-03T08:00:00Z')), true);
  assert.equal(isDigestDue(user, at('2026-08-04T08:00:00Z')), false);
});

test('weekly anchors to the weekday of the previous digest', () => {
  const user = {
    preferences: { digest_frequency: 'weekly', digest_time: '08:00', timezone: 'UTC' },
    // A Wednesday.
    last_digest_sent: '2026-07-29T08:00:00Z',
  };
  assert.equal(isDigestDue(user, at('2026-08-05T08:00:00Z')), true); // next Wednesday
  assert.equal(isDigestDue(user, at('2026-08-03T08:00:00Z')), false); // Monday
});

test('weekly does not fire twice in the same week', () => {
  const user = {
    preferences: { digest_frequency: 'weekly', digest_time: '08:00', timezone: 'UTC' },
    last_digest_sent: '2026-08-03T08:00:00Z',
  };
  assert.equal(isDigestDue(user, at('2026-08-03T08:20:00Z')), false);
});

// ── defaults and bad input ────────────────────────────────────────────────────
test('missing preferences fall back to daily 08:00 UTC', () => {
  assert.equal(isDigestDue({}, at('2026-08-02T08:00:00Z')), true);
  assert.equal(isDigestDue({}, at('2026-08-02T15:00:00Z')), false);
});

test('a malformed digest_time never fires rather than throwing', () => {
  const user = daily({
    preferences: { digest_frequency: 'daily', digest_time: 'not-a-time', timezone: 'UTC' },
  });
  assert.equal(isDigestDue(user, at('2026-08-02T08:00:00Z')), false);
});

test('an unknown frequency never fires', () => {
  const user = daily({
    preferences: { digest_frequency: 'hourly', digest_time: '08:00', timezone: 'UTC' },
  });
  assert.equal(isDigestDue(user, at('2026-08-02T08:00:00Z')), false);
});

test('an unparseable last_digest_sent is treated as never sent', () => {
  const user = daily({ last_digest_sent: 'garbage' });
  assert.equal(isDigestDue(user, at('2026-08-02T08:00:00Z')), true);
});
