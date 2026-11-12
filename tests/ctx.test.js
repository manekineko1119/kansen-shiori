import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCtx } from '../src/ui/ctx.js';

test('画面の today は日本時間の日付（UTC 15:30 は翌日 0:30）', () => {
  const ctx = buildCtx({ route: { name: 'home', params: {}, query: '' }, state: null, user: null, masters: null, settings: null, nowMs: Date.UTC(2026, 10, 30, 15, 30) });
  assert.equal(ctx.today, '2026-12-01');
});
