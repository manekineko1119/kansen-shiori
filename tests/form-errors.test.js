import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindErrors } from '../src/ui/components/form-util.js';
import { createViewState } from '../src/ui/view-state.js';

// data-err の箱だけを持つ偽のフォーム
function fakeForm(names) {
  const boxes = Object.fromEntries(names.map((n) => [n, { textContent: '' }]));
  const listeners = {};
  return {
    boxes, listeners,
    querySelector: (sel) => boxes[/data-err="(.+)"/.exec(sel)[1]] ?? null,
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
}
const ctx = (state) => ({ key: 'K', state });

test('入力で消えるのは、理由として覚えた箱だけ。写真の失敗・読み込み失敗の文は消さない', () => {
  const state = createViewState();
  const form = fakeForm(['title', 'photo', '_form']);
  form.boxes.photo.textContent = '写真を送れませんでした';
  form.boxes._form.textContent = '読み込めませんでした';
  const errs = bindErrors(ctx(state), form, 'f');
  errs.show({ title: '必須です' });
  assert.equal(form.boxes.title.textContent, '必須です');
  form.listeners.input();
  assert.equal(form.boxes.title.textContent, '');
  assert.equal(form.boxes.photo.textContent, '写真を送れませんでした');
  assert.equal(form.boxes._form.textContent, '読み込めませんでした');
  assert.deepEqual(state.getErrors('K|f'), {});
});

test('作り直したフォームに覚えた理由を出し直す。箱がない項目は _form に出す', () => {
  const state = createViewState();
  bindErrors(ctx(state), fakeForm(['title', '_form']), 'f').show({ title: 'あ', nope: 'い' });
  const form2 = fakeForm(['title', '_form']);
  bindErrors(ctx(state), form2, 'f');
  assert.equal(form2.boxes.title.textContent, 'あ');
  assert.equal(form2.boxes._form.textContent, 'い');
});
