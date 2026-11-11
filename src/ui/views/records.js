// 観戦記録の一覧（#/records。設計書 3.4.2、FR-56・58・57b）：集計・直近5試合・終わった試合すべて
// シーズン（?s=）と「観戦した試合だけ」（?only=1）は URL が持つ（D32）。行をタップすると #/records/<試合ID>
import { el, split } from '../components/parts.js';
import { renderRecordList } from '../components/record-list.js';
import { parseRecordsQuery, pickSeason } from '../../core/record-list.js';

export function renderRecords(ctx) {
  const root = el('div', { class: 'records' });
  const { masters } = ctx;
  if (masters.status === 'loading') { root.append(el('p', { class: 'muted' }, '読み込み中です。')); return root; }
  if (masters.status === 'unavailable') { root.append(el('p', { class: 'note', role: 'status' }, masters.message)); return root; }
  if (masters.status === 'offline') root.append(el('p', { class: 'note', role: 'status' }, masters.label));

  const query = parseRecordsQuery(ctx.route.query);
  const currentId = masters.data.season?.id ?? null;
  const online = masters.status !== 'offline' && !ctx.user?.offline;
  const seasons = online ? ctx.data.seasons() : null; // オフラインでは選択肢を読まない（今のシーズンだけ）
  const seasonId = pickSeason({ requested: query.season, currentId, seasons });
  if (seasonId === null) {
    root.append(el('section', { class: 'sec' }, el('p', { class: 'muted' }, 'シーズンがまだ登録されていません')));
    return root;
  }
  root.append(split({ list: renderRecordList(ctx, { seasonId, seasons, onlyWatched: query.only }), detail: null }));
  return root;
}
