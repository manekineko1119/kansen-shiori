import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toFormError } from '../../src/data/errors.js';

test('保存の失敗の理由', () => {
  assert.deepEqual(toFormError({ code: '42501', message: 'x' }), { _form: '権限がありません' });
  assert.equal(toFormError({ code: 'PGRST301', message: 'JWT expired' }), 'expired');
  assert.equal(toFormError({ code: 'PGRST303', message: 'x' }), 'expired');
  assert.equal(toFormError({ status: 401, message: 'x' }), 'expired');
  assert.deepEqual(toFormError({ code: '23514', message: 'x' }), { _form: '入力の値を保存できませんでした' });
  assert.deepEqual(toFormError({ code: '22P02', message: 'x' }), { _form: '入力の値を保存できませんでした' });
  assert.deepEqual(toFormError(new TypeError('Failed to fetch')), { _form: '保存できませんでした。通信できる場所でもう一度保存してください' });
  assert.deepEqual(toFormError(null), { _form: '保存できませんでした。通信できる場所でもう一度保存してください' });
});

test('削除の失敗の理由（7-6 の実機の確認で、削除に「保存できませんでした」が出ていた）', () => {
  assert.deepEqual(toFormError(new TypeError('Failed to fetch'), 'delete'), { _form: '削除できませんでした。通信できる場所でもう一度削除してください' });
  assert.deepEqual(toFormError(null, 'delete'), { _form: '削除できませんでした。通信できる場所でもう一度削除してください' });
  assert.deepEqual(toFormError({ code: '23503', message: 'x' }, 'delete'), { _form: '削除できませんでした' });
  assert.deepEqual(toFormError({ code: '42501', message: 'x' }, 'delete'), { _form: '権限がありません' });
  assert.equal(toFormError({ code: 'PGRST301', message: 'x' }, 'delete'), 'expired');
});
