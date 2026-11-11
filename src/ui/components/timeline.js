// 時刻の流れ（タイムライン。設計書 3.2）。items = [{ time, label, key }]。key は大きな主な色の数字（到着目標など）
import { el } from './parts.js';

// cap：上に添える小さな文（ノードか文字）。one：1点だけのとき。undecided：items が空のときの文
export function renderTimeline({ cap, items, foot, one = false, undecided = '' }) {
  const body = items.length === 0
    ? el('p', { class: 'undecided' }, undecided)
    : el('ol', null, items.map((i) => el('li', { class: i.key ? 'key' : null },
      el('i'), el('b', { class: 'fig' }, i.time), el('span', null, i.label))));
  return el('div', { class: one ? 'tl one' : 'tl' },
    cap ? el('p', { class: 'cap' }, cap) : null, body, foot ? el('p', { class: 'foot' }, foot) : null);
}
