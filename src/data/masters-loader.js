// 共通データ：スナップショットで先に出し、裏で最新を取って差し替える（NFR-04）
import { readMastersSnapshot, refreshMasters } from './masters.js';

// onChange(masters) は状態が変わるたびに呼ばれる（画面を描き直す）
export async function loadMasters({ client, snapshot, nowMs, onChange }) {
  try {
    const old = await readMastersSnapshot(snapshot);
    if (old) onChange({ status: 'cached', data: old.data }); // 取得前。オフラインとは出さない
  } catch {
    // 保存したものは使わず、最新を取りにいく
  }
  onChange(await refreshMasters({ client, snapshot, nowMs }));
}
