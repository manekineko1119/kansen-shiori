// 結果画面の飛行機の部分（設計書 3.2 の4a・5.9・6章）。時刻の目安は flight.js、リンクは links/ から作る。
import { flightPlan } from './flight.js';
import { flightDates } from './lodging.js';
import { yahooTransitUrl } from './links/yahoo-transit.js';
import { mapsDirectionsUrl, mapsSearchUrl } from './links/google-maps.js';
import { skyscannerUrl } from './links/skyscanner.js';

// 出発空港ごとのスカイスキャナー（目的地が null ならトップ）
function skyscannerLinks(settings, to, dates) {
  return settings.origin_airports.map(({ code, name }) => ({
    code, name, url: skyscannerUrl({ from: code, to, outbound: dates.outbound, inbound: dates.inbound }),
  }));
}

/**
 * 飛行機の欄。arrive は到着目標の { date, time }（キックオフ未定なら null）。
 * stadium が null か最寄り空港がなければ { noAirport: true, skyscanner }。
 * toAirport は「出発地 → 出発空港」（出発空港ごと）、fromAirport は「到着空港 → スタジアム」。
 */
export function buildFlight({ matchDate, kickoff, lodging, settings, stadium, arrive }) {
  const dates = flightDates(matchDate, lodging);
  const arrivalAirport = stadium?.airports?.[0] ?? null;
  if (!arrivalAirport) return { noAirport: true, skyscanner: skyscannerLinks(settings, null, dates) };

  const plan = flightPlan({
    matchDate, kickoff, arriveBeforeMin: settings.arrive_before_min, lodging, arrivalAirport,
    originAirports: settings.origin_airports, checkinMin: settings.airport_checkin_min, arrivalMin: settings.airport_arrival_min,
  });

  // 空港に駅があれば乗換案内（到着時刻＝到着目標）、なければ Googleマップ（公共交通）
  const fromAirport = {
    url: arrivalAirport.station
      ? yahooTransitUrl({ from: arrivalAirport.station, to: stadium.stations?.[0]?.name ?? stadium.name, date: arrive?.date ?? matchDate, arriveTime: arrive?.time ?? null })
      : mapsDirectionsUrl({ origin: arrivalAirport.name, lat: stadium.lat, lng: stadium.lng, travelmode: 'transit' }),
    note: arrivalAirport.note ?? null,
  };

  // 空港に駅があれば乗換案内（便の出発時刻は分からないので時刻は指定しない）、なければ Googleマップの検索
  const toAirport = settings.origin_airports.map(({ code, name, station, note }) => ({
    code,
    url: station
      ? yahooTransitUrl({ from: settings.origin_station, to: station, date: dates.outbound, arriveTime: null })
      : mapsSearchUrl({ query: name }),
    note: note ?? null,
  }));

  return { ...plan, arrivalAirport, skyscanner: skyscannerLinks(settings, arrivalAirport.iata, dates), toAirport, fromAirport };
}
