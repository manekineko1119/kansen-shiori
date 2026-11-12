import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIos, shouldShowInstallGuide, swMode } from '../src/core/pwa.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 16; SM-F976Q) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
};

test('isIos：iPhone・iPad と、Mac の名前を名乗る iPadOS（タッチあり）を iOS とみなす', () => {
  assert.equal(isIos({ userAgent: UA.iphone, maxTouchPoints: 5 }), true);
  assert.equal(isIos({ userAgent: UA.ipad, maxTouchPoints: 5 }), true);
  assert.equal(isIos({ userAgent: UA.mac, maxTouchPoints: 5 }), true);
});

test('isIos：Mac（タッチなし）・Android・Windows は iOS でない', () => {
  assert.equal(isIos({ userAgent: UA.mac, maxTouchPoints: 0 }), false);
  assert.equal(isIos({ userAgent: UA.android, maxTouchPoints: 5 }), false);
  assert.equal(isIos({ userAgent: UA.windows, maxTouchPoints: 0 }), false);
  assert.equal(isIos({ userAgent: undefined, maxTouchPoints: undefined }), false);
});

test('shouldShowInstallGuide：iOS・ホーム画面から開いていない・閉じていない・検索画面がそろったときだけ', () => {
  const ok = { ios: true, standalone: false, dismissed: false, routeName: 'search' };
  assert.equal(shouldShowInstallGuide(ok), true);
  assert.equal(shouldShowInstallGuide({ ...ok, ios: false }), false);
  assert.equal(shouldShowInstallGuide({ ...ok, standalone: true }), false);
  assert.equal(shouldShowInstallGuide({ ...ok, dismissed: true }), false);
  assert.equal(shouldShowInstallGuide({ ...ok, routeName: 'result' }), false);
});

test('swMode：localhost・127.0.0.1 は ?sw=1 のときだけ登録し、ほかは登録を外す', () => {
  assert.equal(swMode({ hostname: 'localhost', search: '' }), 'unregister');
  assert.equal(swMode({ hostname: '127.0.0.1', search: '?code=abc' }), 'unregister');
  assert.equal(swMode({ hostname: 'localhost', search: '?sw=1' }), 'register');
  assert.equal(swMode({ hostname: 'localhost', search: '?x=2&sw=1' }), 'register');
  assert.equal(swMode({ hostname: 'manekineko1119.github.io', search: '' }), 'register');
});
