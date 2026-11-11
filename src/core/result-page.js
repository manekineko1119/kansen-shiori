// 結果画面の中身とリンク一式（設計書 3.2・6章・9章、FR-09〜15・23、D35）。通信しない純粋な関数。
// 日付・時刻は日本時間の文字列。URL の組み立ては links/ の関数に任せる。
import { arrivalTarget, matchEndEstimate } from './time.js';
import { lodgingDates } from './lodging.js';
import { venueOf, opponentOf } from './fixture-view.js';
import { buildFlight } from './result-flight.js';
import { yahooTransitUrl } from './links/yahoo-transit.js';
import { mapsDirectionsUrl, mapsSearchUrl, restaurantQuery } from './links/google-maps.js';
import { busLinks } from './links/bus.js';
import { toyokoHotelUrl, toyokoPrefectureUrl, toyokoHotelsForStations } from './links/toyoko-inn.js';
import { agodaUrl } from './links/agoda.js';
import { jleagueMatchLink, jleagueTicketUrl } from './links/jleague.js';

const NOT_FOUND = { error: 'not_found' };
const TITLE_MAX = 50;
const UNKNOWN_VENUE = '会場未定';

const clubOf = (id, clubsById) => clubsById?.[id] ?? { id, name: id, short_name: id };

// 条件から試合の素材を決める。見つからなければ null
function resolveMatch(query, { fixturesById, clubsById, stadiumsById }, supportClubId) {
  if (query.fixtureId) {
    const f = fixturesById?.[query.fixtureId];
    if (!f) return null;
    const venue = venueOf(f, { clubsById, stadiumsById });
    return {
      date: f.match_date, kickoff: f.kickoff ?? null,
      title: `${clubOf(f.home_club_id, clubsById).name} vs ${clubOf(f.away_club_id, clubsById).name}`,
      venue, venueUnknown: venue.stadium === null && !f.venue_name_override,
      opponent: opponentOf(f, supportClubId, clubsById), fixtureId: f.id, customVenue: null, matchUrl: f.jleague_match_url ?? null,
    };
  }
  const c = query.custom;
  if (!c?.date) return null; // 手入力は日付が必要
  const opponent = c.opponentId ? clubOf(c.opponentId, clubsById) : null;
  let venue;
  if (c.venue) {
    venue = { stadium: null, name: c.venue };
  } else {
    const home = stadiumsById?.[clubsById?.[c.opponentId]?.home_stadium_id] ?? null;
    venue = home ? { stadium: home, name: home.name } : { stadium: null, name: UNKNOWN_VENUE };
  }
  return {
    date: c.date, kickoff: c.kickoff ?? null,
    title: opponent ? `${clubOf(supportClubId, clubsById).name} vs ${opponent.name}` : venue.name,
    venue, venueUnknown: venue.stadium === null && !c.venue,
    opponent, fixtureId: null, customVenue: venue.name, matchUrl: null,
  };
}

// 電車・車のリンク（D35）。trainVia は電車のリンクの種類（'yahoo' か 'maps'）。会場未定は出さない
// スタジアムなし（手入力の会場）：電車は here でなければ会場名で乗換案内、here なら会場名の Googleマップ検索。車は常に会場名の検索
function routeLinks({ query, settings, match, arrive }) {
  const out = { train: null, trainVia: null, car: null };
  if (match.venueUnknown) return out;
  const { stadium, name } = match.venue;
  const modes = new Set(query.modes);
  const here = query.origin === 'here';
  const origin = here ? null : `${settings.origin_station}駅`;
  if (modes.has('train')) {
    if (here) {
      // Yahoo!乗換案内は現在地を出発地にできないので Googleマップ（スタジアムなしは会場名の検索）
      out.trainVia = 'maps';
      out.train = stadium
        ? mapsDirectionsUrl({ origin: null, lat: stadium.lat, lng: stadium.lng, travelmode: 'transit' })
        : mapsSearchUrl({ query: name });
    } else {
      out.trainVia = 'yahoo';
      out.train = yahooTransitUrl({
        from: settings.origin_station, to: stadium ? (stadium.stations?.[0]?.name ?? stadium.name) : name,
        date: arrive?.date ?? match.date, arriveTime: arrive?.time ?? null,
      });
    }
  }
  if (modes.has('car')) {
    out.car = stadium
      ? mapsDirectionsUrl({ origin, lat: stadium.lat, lng: stadium.lng, travelmode: 'driving' })
      : mapsSearchUrl({ query: name });
  }
  return out;
}

function lodgingSection({ query, match }) {
  const dates = lodgingDates(match.date, query.lodging);
  if (!dates) return null;
  const { checkIn, checkOut, nights } = dates;
  const stadium = match.venue.stadium;
  const hotels = toyokoHotelsForStations(stadium?.stations ?? []).map((h) => ({
    name: h.name, walk_min: h.walk_min, station: h.station, kind: h.kind, url: toyokoHotelUrl({ hotel: h.hotel, checkIn, checkOut }),
  }));
  return {
    checkIn, checkOut, nights, hotels,
    prefectureUrl: stadium ? toyokoPrefectureUrl({ prefecture: stadium.prefecture, checkIn, checkOut }) : null,
    agodaUrl: agodaUrl({ area: stadium?.agoda_area ?? null, checkIn, nights }),
  };
}

// 遠征予定の名前：相手の短い名前＋遠征。相手がなければ会場名＋遠征。50文字まで
function tripTitle(match) {
  return [...`${match.opponent ? match.opponent.short_name : match.venue.name}遠征`].slice(0, TITLE_MAX).join('');
}

/**
 * @param {{ query: object|null, masters: object, settings: object, supportClubId: string }} args
 *   query は parseResultQuery の値。試合が見つからなければ { error: 'not_found' }
 */
export function buildResultPage({ query, masters, settings, supportClubId }) {
  const match = query ? resolveMatch(query, masters, supportClubId) : null;
  if (!match) return NOT_FOUND;
  const { stadium, name: venueName } = match.venue;
  const modes = new Set(query.modes);

  const arrive = arrivalTarget(match.date, match.kickoff, settings.arrive_before_min);
  const end = matchEndEstimate(match.date, match.kickoff);
  const { train, trainVia, car } = routeLinks({ query, settings, match, arrive });

  let bus = null;
  if (modes.has('bus')) {
    const links = busLinks({ fromPrefecture: settings.origin_prefecture, toPrefecture: stadium?.prefecture, matchDate: match.date });
    bus = links ? { ...links, end } : { unsupported: true };
  }

  const clubUrl = match.opponent ? clubOf(match.opponent.id, masters.clubsById).jleague_url ?? null : null;

  return {
    summary: { date: match.date, kickoff: match.kickoff, title: match.title, venueName },
    venueUnknown: match.venueUnknown,
    timeline: { arrive, kickoff: arrive ? match.kickoff : null, end },
    stadium,
    train, trainVia, car, bus,
    flight: modes.has('plane')
      ? buildFlight({ matchDate: match.date, kickoff: match.kickoff, lodging: query.lodging, settings, stadium, arrive })
      : null,
    lodging: lodgingSection({ query, match }),
    food: match.venueUnknown ? null : mapsSearchUrl({ query: restaurantQuery(venueName) }),
    jleague: { match: jleagueMatchLink({ matchUrl: match.matchUrl, clubUrl }), ticket: jleagueTicketUrl(match.matchUrl) },
    tripDraft: {
      fixture_id: match.fixtureId,
      custom_venue: match.fixtureId ? null : match.customVenue,
      custom_date: match.fixtureId ? null : match.date,
      title: tripTitle(match),
      modes: query.modes,
      lodging: query.lodging,
    },
  };
}
