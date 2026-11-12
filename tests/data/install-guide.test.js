import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInstallGuide } from '../../src/data/install-guide.js';
import { fakeLocal } from '../helpers/fake-storage.js';

test('最初は閉じていない。閉じたら覚える', () => {
  const local = fakeLocal();
  const g = createInstallGuide(local);
  assert.equal(g.dismissed(), false);
  g.dismiss();
  assert.equal(g.dismissed(), true);
  assert.equal(createInstallGuide(local).dismissed(), true);
});

test('壊れた値は閉じていないとみなす', () => {
  assert.equal(createInstallGuide(fakeLocal({ 'kansen.installGuideDismissed': 'こわれた' })).dismissed(), false);
});

test('保存できなくても落ちない', () => {
  const local = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  const g = createInstallGuide(local);
  assert.doesNotThrow(() => g.dismiss());
});
