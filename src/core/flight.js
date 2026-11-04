// 飛行機の時刻の目安（設計書 5.9）。純粋な関数だけ。

import { arrivalTarget, matchEndEstimate, addMinutes } from './time.js';

export const EARLIEST_LANDING = '06:00';
export const LATEST_RETURN = '21:00';

export const FLIGHT_WARNINGS = {
  early: '当日の便では間に合わない可能性があります。前泊を検討してください',
  late: '当日の帰りの便がない可能性があります。後泊を検討してください',
};

// 当日の計算ができない理由。優先順位：宿 → 空港なし → 所要時間未登録 → キックオフ未定
function pickNote(lodgingNote, kickoff, arrivalAirport) {
  if (lodgingNote) return lodgingNote;
  if (arrivalAirport == null) return 'noAirport';
  if (arrivalAirport.access_min == null) return 'accessUnknown';
  if (kickoff == null) return 'kickoffUnknown';
  return 'sameDay';
}

export function flightPlan({ matchDate, kickoff, arriveBeforeMin, lodging, arrivalAirport, originAirports, checkinMin, arrivalMin }) {
  const landingNote = pickNote(lodging === 'pre' || lodging === 'both' ? 'prevDay' : null, kickoff, arrivalAirport);
  const returnNote = pickNote(lodging === 'post' || lodging === 'both' ? 'nextDay' : null, kickoff, arrivalAirport);

  let landingTarget = null;
  if (landingNote === 'sameDay') {
    const arrive = arrivalTarget(matchDate, kickoff, arriveBeforeMin);
    landingTarget = addMinutes(arrive, -(arrivalAirport.access_min + arrivalMin));
  }
  let returnDepartAfter = null;
  if (returnNote === 'sameDay') {
    const end = matchEndEstimate(matchDate, kickoff);
    returnDepartAfter = addMinutes(end, arrivalAirport.access_min + checkinMin);
  }

  const warnings = [];
  if (landingTarget && (landingTarget.date < matchDate || landingTarget.time < EARLIEST_LANDING)) {
    warnings.push(FLIGHT_WARNINGS.early);
  }
  if (returnDepartAfter && (returnDepartAfter.date > matchDate || returnDepartAfter.time > LATEST_RETURN)) {
    warnings.push(FLIGHT_WARNINGS.late);
  }

  const airports = originAirports.map(({ code, name, access_min }) => ({
    code,
    name,
    leaveBeforeMin: access_min == null ? null : access_min + checkinMin,
    homeAfterMin: access_min == null ? null : arrivalMin + access_min,
  }));

  return { landingTarget, returnDepartAfter, landingNote, returnNote, warnings, airports };
}
