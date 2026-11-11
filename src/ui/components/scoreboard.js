// スコアボード（観戦記録。設計書 3.4.1）。白地のカード。ホーム－アウェイの公式の並び。結果の印は応援クラブ目線。エンブレムは使わない
import { el } from './parts.js';
import { competitionLabel, statusLabel, venueOf, splitScorers } from '../../core/fixture-view.js';
import { formatDateLong } from '../../core/format.js';
import { matchOutcome, OUTCOME_MARK, OUTCOME_LABEL } from '../../core/result.js';

const nameOf = (id, clubsById) => clubsById?.[id]?.name ?? id ?? '未定';

function team(side, id, { clubsById, supportClubId }) {
  return el('div', { class: `sb-team ${side}${id && id === supportClubId ? ' me' : ''}` }, nameOf(id, clubsById),
    el('small', null, side === 'home' ? 'ホーム' : 'アウェイ'));
}

export function renderScoreboard({ fixture: f, clubsById, stadiumsById, supportClubId }) {
  const env = { clubsById, supportClubId };
  const hasScore = f.home_score != null && f.away_score != null;
  const outcome = matchOutcome(f, supportClubId);
  const status = statusLabel(f);
  const goals = splitScorers(f);
  const kickoff = f.kickoff ? `${f.kickoff} キックオフ` : 'キックオフ時刻未定';
  const lines = (list) => list.map((t) => el('div', null, t));

  return el('div', { class: 'sb num' },
    el('div', { class: 'sb-meta' }, el('b', null, competitionLabel(f)), el('br'),
      `${formatDateLong(f.match_date)} ${kickoff}`, el('br'), venueOf(f, { clubsById, stadiumsById }).name),
    status ? el('div', { class: 'sb-status' }, status) : null,
    el('div', { class: 'sb-main' },
      team('home', f.home_club_id, env),
      el('div', { class: 'sb-score fig', 'aria-label': hasScore ? `${f.home_score}対${f.away_score}` : 'スコアなし' },
        hasScore ? [String(f.home_score), el('i', null, '-'), String(f.away_score)] : '－'),
      team('away', f.away_club_id, env)),
    outcome ? el('div', { class: 'sb-res' }, el('span', { class: `res ${outcome}` }, `${OUTCOME_MARK[outcome]} ${OUTCOME_LABEL[outcome]}`)) : null,
    goals.home.length || goals.away.length
      ? el('div', { class: 'sb-goals' }, el('div', { class: 'home' }, lines(goals.home)), el('div', { class: 'away' }, lines(goals.away)))
      : null);
}
