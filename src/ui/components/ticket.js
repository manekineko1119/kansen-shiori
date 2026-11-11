// 次のアウェイ戦のきっぷ（設計書 3.1）。文字は ticketInfo（src/core/search-form.js）が作る
import { el } from './parts.js';

// fixture = { kicker, vs, where }。kickoff は 'HH:MM'、未定なら 'キックオフ未定'
export function renderTicket({ fixture, from, to, kickoff, days, onSearch, onPick }) {
  const undecided = !/^\d{2}:\d{2}$/.test(kickoff);
  const main = el('div', { class: 'tk-main', role: 'button', tabindex: '0', 'aria-label': `${fixture.vs}を条件に入れる` },
    el('p', { class: 'tk-k' }, fixture.kicker),
    el('p', { class: 'tk-route', 'aria-label': `${from}から${to}` }, el('span', null, from), el('i'), el('span', null, to)),
    el('p', { class: 'tk-vs' }, fixture.vs),
    el('p', { class: 'tk-where' }, fixture.where));
  main.addEventListener('click', onPick);
  main.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } });
  return el('article', { class: 'ticket', 'aria-label': '次のアウェイ戦' },
    main,
    el('div', { class: 'tk-stub' },
      undecided ? el('b', { class: 'tk-undecided' }, kickoff) : [el('span', null, 'キックオフ'), el('b', { class: 'fig' }, kickoff)],
      el('em', null, days)),
    el('button', { class: 'tk-btn', type: 'button', onclick: onSearch }, 'この試合で検索'));
}
