import { DateTime } from 'luxon';

// How long after the user's preferred time we're still willing to send.
const SEND_WINDOW_MINUTES = 30;

// Minimum gap since the last digest, per frequency. Slightly under the nominal
// interval so a run that drifts a few minutes late doesn't skip a whole cycle.
const MIN_GAP = {
  daily: { unit: 'hours', value: 23 },
  twice_daily: { unit: 'hours', value: 11 },
  weekly: { unit: 'days', value: 6.5 },
};

function withinWindow(nowInZone, target) {
  const diff = nowInZone.diff(target, 'minutes').minutes;
  return diff >= 0 && diff <= SEND_WINDOW_MINUTES;
}

function gapElapsed(frequency, lastSent, now) {
  if (!lastSent) return true;
  const { unit, value } = MIN_GAP[frequency] ?? MIN_GAP.daily;
  const last = DateTime.fromISO(lastSent);
  if (!last.isValid) return true;
  return now.diff(last, unit)[unit] >= value;
}

/**
 * Is this user due a digest right now?
 *
 * @param {{ preferences?: object, last_digest_sent?: string|null }} user
 * @param {DateTime} [now] - injectable for tests; defaults to the current time
 * @returns {boolean}
 */
export function isDigestDue(user, now = DateTime.now()) {
  const prefs = user?.preferences || {};
  const frequency = prefs.digest_frequency || 'daily';
  const timezone = prefs.timezone || 'UTC';
  const digestTime = prefs.digest_time || '08:00';
  const lastSent = user?.last_digest_sent;

  const [hour, minute] = String(digestTime)
    .split(':')
    .map((part) => Number(part));

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const nowInZone = now.setZone(timezone);
  if (!nowInZone.isValid) return false;

  const preferred = nowInZone.set({ hour, minute, second: 0, millisecond: 0 });

  if (frequency === 'daily') {
    return withinWindow(nowInZone, preferred) && gapElapsed('daily', lastSent, now);
  }

  if (frequency === 'twice_daily') {
    const second = preferred.plus({ hours: 12 });
    const inWindow = withinWindow(nowInZone, preferred) || withinWindow(nowInZone, second);
    return inWindow && gapElapsed('twice_daily', lastSent, now);
  }

  if (frequency === 'weekly') {
    // Anchor to the weekday of the last digest; default to Monday for new users.
    const targetWeekday = lastSent
      ? DateTime.fromISO(lastSent).setZone(timezone).weekday
      : 1;
    if (nowInZone.weekday !== targetWeekday) return false;
    return withinWindow(nowInZone, preferred) && gapElapsed('weekly', lastSent, now);
  }

  return false;
}

export { SEND_WINDOW_MINUTES };
