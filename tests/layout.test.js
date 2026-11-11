import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREAKPOINTS, MEDIA, sizeClass } from '../src/core/layout.js';

test('sizeClass：600・1024 が境目', () => {
  assert.deepEqual([375, 475, 599, 600, 704, 932, 1023, 1024, 1920].map(sizeClass),
    ['S', 'S', 'S', 'M', 'M', 'M', 'M', 'L', 'L']);
});

test('MEDIA は BREAKPOINTS から作る', () => {
  assert.equal(MEDIA.M, `(min-width: ${BREAKPOINTS.M}px)`);
  assert.equal(MEDIA.L, `(min-width: ${BREAKPOINTS.L}px)`);
  assert.equal(MEDIA.M, '(min-width: 600px)');
  assert.equal(MEDIA.L, '(min-width: 1024px)');
});
