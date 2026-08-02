import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJson, normalizeStringArray } from '../src/utils/jobFormatter.js';

// ── parseJson ─────────────────────────────────────────────────────────────────
test('parseJson reads clean JSON', () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
});

test('parseJson recovers JSON wrapped in prose or code fences', () => {
  assert.deepEqual(parseJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Sure! {"about_role":["x"]} Hope that helps.'), {
    about_role: ['x'],
  });
});

test('parseJson throws a clear error when there is no JSON at all', () => {
  assert.throws(() => parseJson('no json here'), /invalid JSON/);
});

// ── normalizeStringArray ──────────────────────────────────────────────────────
test('normalizeStringArray trims entries and drops empties', () => {
  assert.deepEqual(normalizeStringArray(['  a  ', '', '  ', 'b']), ['a', 'b']);
});

test('normalizeStringArray coerces non-strings', () => {
  assert.deepEqual(normalizeStringArray([1, true, null, undefined]), ['1', 'true']);
});

test('normalizeStringArray returns an empty array for non-array input', () => {
  assert.deepEqual(normalizeStringArray(null), []);
  assert.deepEqual(normalizeStringArray('a string'), []);
  assert.deepEqual(normalizeStringArray(undefined), []);
});
