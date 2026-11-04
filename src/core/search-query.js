// 結果画面のURLの条件（`?` 以降）の作成・読み取りと、検索履歴の並べ替え（設計書 3.1、FR-16）。
// 例：f=<試合ID>&m=train,bus&l=post

import { LODGING } from './lodging.js';

// 交通手段の識別子（設計書 4章 trips.modes）
const MODES = ['train', 'car', 'bus', 'plane'];

// 手入力の試合のパラメータ名
const CUSTOM_KEYS = { opponentId: 'o', date: 'd', kickoff: 'k', venue: 'v' };

export function buildResultQuery({ fixtureId, custom, modes, lodging, origin }) {
  const p = new URLSearchParams();
  if (fixtureId) p.set('f', fixtureId);
  if (custom) {
    for (const [key, param] of Object.entries(CUSTOM_KEYS)) {
      if (custom[key]) p.set(param, custom[key]);
    }
  }
  if (modes && modes.length > 0) p.set('m', modes.join(','));
  if (lodging && lodging !== 'none') p.set('l', lodging);
  if (origin === 'here') p.set('here', '1');
  return p.toString();
}

export function parseResultQuery(qs) {
  const p = new URLSearchParams(qs);
  const fixtureId = p.get('f') || null;

  const custom = {};
  for (const [key, param] of Object.entries(CUSTOM_KEYS)) {
    custom[key] = p.get(param) || null;
  }
  const hasCustom = Object.values(custom).some((v) => v !== null);

  if (!fixtureId && !hasCustom) return null;

  const modes = (p.get('m') || '').split(',').filter((m) => MODES.includes(m));
  const l = p.get('l');
  return {
    fixtureId,
    custom: hasCustom ? custom : null,
    modes,
    lodging: LODGING.includes(l) ? l : 'none',
    origin: p.get('here') === '1' ? 'here' : 'settings',
  };
}

// 先頭に足し、同じ条件は前のものを消して、max 件までにする。元の配列は書き換えない
export function pushHistory(history, qs, max = 5) {
  return [qs, ...history.filter((h) => h !== qs)].slice(0, max);
}
