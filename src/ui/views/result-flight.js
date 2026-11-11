// 結果画面の飛行機の欄（設計書 3.2 の4a）。中身は buildResultPage の flight が作る
import { el, section, extLink } from '../components/parts.js';
import { renderTimeline } from '../components/timeline.js';
import { formatDateJa, minutesText } from '../../core/format.js';
import { flightDates } from '../../core/lodging.js';
import { LODGING_NAMES } from '../../core/search-form.js';

const NOTES = {
  kickoffUnknown: 'キックオフ時刻が未定のため、時刻の目安は出せません',
  accessUnknown: '空港からスタジアムまでの所要時間が未登録のため、時刻の目安は出せません',
};

function landingTimeline(f, page, settings) {
  const { arrive, kickoff } = page.timeline;
  const where = f.arrivalAirport.name;
  return renderTimeline({
    cap: [el('b', null, `行きの便（${formatDateJa(page.summary.date)}）`)],
    items: [
      { time: f.landingTarget.time, label: `${where}に着陸`, key: true },
      { time: arrive.time, label: 'スタジアム到着' },
      { time: kickoff, label: 'キックオフ' },
    ],
    foot: `内訳：空港からスタジアムまで ${f.arrivalAirport.access_min}分＋到着後の余裕 ${settings.airport_arrival_min}分`,
  });
}

function returnTimeline(f, page, settings) {
  return renderTimeline({
    one: true,
    cap: [el('b', null, `帰りの便（${formatDateJa(page.summary.date)}）`)],
    items: [{ time: f.returnDepartAfter.time, label: `以降に${f.arrivalAirport.name}を出発する便`, key: true }],
    foot: `内訳：試合終了 ${page.timeline.end.time}、スタジアムから空港まで ${f.arrivalAirport.access_min}分、搭乗手続きの余裕 ${settings.airport_checkin_min}分`,
  });
}

// 出発空港ごとの行：スカイスキャナー、家を出る目安、帰宅の目安
function skyscannerRow(s, a, venue, settings) {
  const out = a?.leaveBeforeMin == null
    ? '出発地から空港までの所要時間が未登録です'
    : `家を出るのは便の出発の約${minutesText(a.leaveBeforeMin)}前（${minutesText(a.leaveBeforeMin - settings.airport_checkin_min)}＋手続き${settings.airport_checkin_min}分）`;
  const home = a?.homeAfterMin == null ? '' : `帰宅は着陸の約${minutesText(a.homeAfterMin)}後`;
  return extLink({ href: s.url, label: `${s.name} → ${venue}（スカイスキャナー）`, sub: [out, home].filter(Boolean).join('　') });
}

export function renderFlight({ page, query, settings }) {
  const f = page.flight;
  const d = flightDates(page.summary.date, query.lodging);
  const heading = `飛行機（${LODGING_NAMES[query.lodging]}　${formatDateJa(d.outbound)}発・${formatDateJa(d.inbound)}帰り）`;
  if (f.noAirport) {
    return section(heading,
      el('p', { class: 'note' }, 'このスタジアムの最寄り空港が未登録です。スカイスキャナーは目的地なしで開きます'),
      f.skyscanner.map((s) => extLink({ href: s.url, label: `${s.name}から（スカイスキャナー）` })));
  }

  const nodes = [];
  if (f.landingNote === 'sameDay') nodes.push(landingTimeline(f, page, settings));
  else if (f.landingNote === 'prevDay') nodes.push(el('p', { class: 'muted' }, `行きは前日（${formatDateJa(d.outbound)}）の便です`));
  else if (NOTES[f.landingNote]) nodes.push(el('p', { class: 'muted' }, NOTES[f.landingNote]));
  if (f.returnNote === 'sameDay') nodes.push(returnTimeline(f, page, settings));
  else if (f.returnNote === 'nextDay') nodes.push(el('p', { class: 'muted' }, `帰りは翌日（${formatDateJa(d.inbound)}）の便です`));
  for (const w of f.warnings) nodes.push(el('p', { class: 'note', role: 'status' }, w));

  const venue = page.summary.venueName;
  const byCode = Object.fromEntries(f.airports.map((a) => [a.code, a]));
  const originAirports = settings.origin_airports;
  const nameOf = (code) => originAirports.find((a) => a.code === code)?.name ?? code;
  return el('div', null,
    section(heading, nodes,
      el('div', { class: 'sec-in' }, f.skyscanner.map((s) => skyscannerRow(s, byCode[s.code], venue, settings)))),
    section('空港への移動・空港からの移動',
      f.toAirport.map((t) => extLink({
        href: t.url, label: `${settings.origin_station} → ${nameOf(t.code)}`,
        sub: [originAirports.find((a) => a.code === t.code)?.station ? 'Yahoo!乗換案内' : 'Googleマップ', t.note].filter(Boolean).join('　'),
      })),
      extLink({
        href: f.fromAirport.url, label: `${f.arrivalAirport.name} → ${venue}`,
        sub: [f.arrivalAirport.station ? 'Yahoo!乗換案内' : 'Googleマップ（公共交通）', f.fromAirport.note].filter(Boolean).join('　'),
      })));
}
