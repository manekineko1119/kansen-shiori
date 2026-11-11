// 管理画面（スタジアム・クラブ）の入力 → 保存する値への変換（設計書 3.4・4.1、D30）。純粋な関数だけ
// values：入力欄の name → 文字列。駅・東横イン・空港の行は station_<i>_<項目>、station_<i>_toyoko_<j>_<項目>、airport_<i>_<項目> という name で持つ
import { toHalfWidth } from '../../supabase/functions/_shared/text.js';
import { parseToyokoHotelId } from './links/toyoko-inn.js';
import { parseAgodaArea } from './links/agoda.js';

const text = (v) => String(v ?? '').trim();
const blankToNull = (v) => (text(v) === '' ? null : text(v));

// 全角の数字を半角にして整数に。整数にできなければ NaN（検証が項目ごとに理由を出す）
function toInt(v) {
  const s = toHalfWidth(v).trim();
  return /^\d+$/.test(s) ? Number(s) : NaN;
}
const toNum = (v) => {
  const s = toHalfWidth(v).trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};
const intOrNull = (v) => (text(v) === '' ? null : toInt(v));

// 先頭から i 番目…と並んだ行の番号（キーから数える。小さい順）
function indexes(values, re) {
  const set = new Set();
  for (const k of Object.keys(values)) {
    const m = re.exec(k);
    if (m) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}
const stationIndexes = (values) => indexes(values, /^station_(\d+)_/);
const toyokoIndexes = (values, i) => indexes(values, new RegExp(`^station_${i}_toyoko_(\\d+)_`));
const airportIndexes = (values) => indexes(values, /^airport_(\d+)_/);

/** 東横インの URL（または5桁の番号）から店の番号を読む。読めなければ null */
export function toyokoHotelFromInput(input) {
  const s = toHalfWidth(input).trim();
  return /^\d{5}$/.test(s) ? s : parseToyokoHotelId(s);
}

/** 配列の from 番目を to 番目へ動かした新しい配列（範囲外は動かさない） */
export function moveItem(list, from, to) {
  const out = [...list];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= out.length || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

// ---- 行（入力欄の文字列のまま。空の行も含む） ----
const STATION_FIELDS = ['name', 'kind', 'walk_min', 'note'];
const TOYOKO_FIELDS = ['url', 'name', 'walk_min'];
const AIRPORT_FIELDS = ['iata', 'name', 'station', 'access_min', 'note'];

const pick = (values, prefix, fields) => Object.fromEntries(fields.map((f) => [f, String(values[`${prefix}_${f}`] ?? '')]));

export function stationRows(values) {
  return stationIndexes(values).map((i) => ({
    ...pick(values, `station_${i}`, STATION_FIELDS),
    toyoko: toyokoIndexes(values, i).map((j) => pick(values, `station_${i}_toyoko_${j}`, TOYOKO_FIELDS)),
  }));
}

export function airportRows(values) {
  return airportIndexes(values).map((i) => pick(values, `airport_${i}`, AIRPORT_FIELDS));
}

/** 駅・空港の行を入れ替えた values（行の番号は 0 から振り直し、消した行のキーは残さない）。渡さなかった方はそのまま */
export function replaceRows(values, { stations, airports }) {
  const next = {};
  for (const [k, v] of Object.entries(values)) {
    if (stations && k.startsWith('station_')) continue;
    if (airports && k.startsWith('airport_')) continue;
    next[k] = v;
  }
  stations?.forEach((st, i) => {
    for (const f of STATION_FIELDS) next[`station_${i}_${f}`] = st[f] ?? '';
    (st.toyoko ?? []).forEach((h, j) => {
      for (const f of TOYOKO_FIELDS) next[`station_${i}_toyoko_${j}_${f}`] = h[f] ?? '';
    });
  });
  airports?.forEach((a, i) => {
    for (const f of AIRPORT_FIELDS) next[`airport_${i}_${f}`] = a[f] ?? '';
  });
  return next;
}

// 駅の種類は最初から入っているので、空かどうかには数えない
const stationEmpty = (st) => !text(st.name) && !text(st.walk_min) && !text(st.note) && st.toyoko.every(toyokoEmpty);
const toyokoEmpty = (h) => !text(h.url) && !text(h.name) && !text(h.walk_min);
const airportEmpty = (a) => AIRPORT_FIELDS.every((f) => !text(a[f]));

// ---- スタジアム ----
function agodaFromForm(values) {
  const url = text(values.agoda_url);
  if (url === '') return null;
  const area = parseAgodaArea(url);
  if (!area) return { type: null, id: null }; // 読めない URL。validateStadium が止める
  const name = blankToNull(values.agoda_name);
  return name ? { ...area, name } : area;
}

function verifiedAt(values, today) {
  const s = toHalfWidth(values.verified_at).trim().replace(/\//g, '-');
  return s === '' ? today : s;
}

export function stadiumFromForm(values, today) {
  const stations = stationRows(values).filter((st) => !stationEmpty(st)).map((st) => ({
    name: text(st.name),
    kind: text(st.kind),
    walk_min: intOrNull(st.walk_min),
    note: blankToNull(st.note),
    toyoko: st.toyoko.filter((h) => !toyokoEmpty(h)).map((h) => ({ hotel: toyokoHotelFromInput(h.url), name: text(h.name), walk_min: toInt(h.walk_min) })),
  }));
  const airports = airportRows(values).filter((a) => !airportEmpty(a)).map((a) => ({
    iata: toHalfWidth(a.iata).trim().toUpperCase(),
    name: text(a.name),
    station: blankToNull(a.station),
    access_min: toInt(a.access_min),
    note: blankToNull(a.note),
  }));
  return {
    id: text(values.id), name: text(values.name), prefecture: text(values.prefecture), address: text(values.address),
    lat: toNum(values.lat), lng: toNum(values.lng),
    stations, airports,
    access_url: blankToNull(values.access_url), shuttle_note: blankToNull(values.shuttle_note), parking_note: blankToNull(values.parking_note),
    agoda_area: agodaFromForm(values),
    verified_at: verifiedAt(values, today),
  };
}

const str = (v) => (v === null || v === undefined ? '' : String(v));

/** 登録済みのスタジアム → 入力欄の値 */
export function stadiumToValues(stadium) {
  const stations = (stadium.stations ?? []).map((st) => ({
    name: str(st.name), kind: str(st.kind), walk_min: str(st.walk_min), note: str(st.note),
    toyoko: (st.toyoko ?? []).map((h) => ({ url: h.hotel ? `https://www.toyoko-inn.com/search/detail/${h.hotel}/` : '', name: str(h.name), walk_min: str(h.walk_min) })),
  }));
  const airports = (stadium.airports ?? []).map((a) => Object.fromEntries(AIRPORT_FIELDS.map((f) => [f, str(f === 'iata' ? a.iata : a[f])])));
  const ag = stadium.agoda_area;
  return replaceRows({
    id: str(stadium.id), name: str(stadium.name), prefecture: str(stadium.prefecture), address: str(stadium.address),
    lat: str(stadium.lat), lng: str(stadium.lng),
    access_url: str(stadium.access_url), shuttle_note: str(stadium.shuttle_note), parking_note: str(stadium.parking_note),
    agoda_url: ag?.type && ag?.id ? `https://www.agoda.com/ja-jp/search?${ag.type}=${ag.id}` : '', agoda_name: str(ag?.name),
    verified_at: str(stadium.verified_at),
  }, { stations, airports });
}

/**
 * 検証の理由のキー（捨てた空の行の分だけずれている）を、画面の行の番号に直す。
 * 東横インの店の番号・Agoda の地域は、URL を貼る欄の言葉で言い直す
 */
export function mapStadiumErrors(errors, values) {
  const stRows = stationRows(values);
  const keptStations = stationIndexes(values).filter((_, k) => !stationEmpty(stRows[k]));
  const keptToyoko = (fi) => {
    const k = stationIndexes(values).indexOf(fi);
    return toyokoIndexes(values, fi).filter((_, n) => !toyokoEmpty(stRows[k].toyoko[n]));
  };
  const keptAirports = airportIndexes(values).filter((_, k) => !airportEmpty(airportRows(values)[k]));
  const out = {};
  for (const [key, msg] of Object.entries(errors)) {
    let m;
    if ((m = /^stations\.(\d+)\.toyoko\.(\d+)\.(.+)$/.exec(key))) {
      const fi = keptStations[Number(m[1])] ?? Number(m[1]);
      const fj = keptToyoko(fi)[Number(m[2])] ?? Number(m[2]);
      out[`stations.${fi}.toyoko.${fj}.${m[3]}`] = m[3] === 'hotel' ? '東横インのページの URL から店の番号を読み取れませんでした（…/search/detail/12345/ の形の URL を貼ってください）' : msg;
    } else if ((m = /^stations\.(\d+)\.(.+)$/.exec(key))) {
      out[`stations.${keptStations[Number(m[1])] ?? Number(m[1])}.${m[2]}`] = msg;
    } else if ((m = /^airports\.(\d+)\.(.+)$/.exec(key))) {
      out[`airports.${keptAirports[Number(m[1])] ?? Number(m[1])}.${m[2]}`] = msg;
    } else if (key === 'agoda_area') {
      out.agoda_url = 'Agoda の URL から地域を読み取れませんでした（region= か city= の入った URL を貼ってください）';
    } else {
      out[key] = msg;
    }
  }
  return out;
}

// ---- クラブ ----
const lines = (v) => String(v ?? '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '');

// 元の取得元に重ねる。画面で編集するのは1件目の channel と highlight・inside のキーワードだけ。
// 1件目のほかの項目（channel_id など）・ほかの種類・2件目以降は残す。ハンドルを変えたときだけ channel_id・uploads_playlist_id を捨てる
function videoSourcesFromForm(values, original = []) {
  let channel = toHalfWidth(values.video_channel).trim();
  if (channel === '') return original.slice(1); // 1件目だけ消す（2件目以降は残す）
  if (!channel.startsWith('@')) channel = `@${channel}`;
  const [first = {}, ...rest] = original;
  const { channel_id: channelId, uploads_playlist_id: uploadsId, ...others } = first;
  const kinds = { ...(first.kinds ?? {}) };
  for (const [kind, key] of [['highlight', 'video_kw_highlight'], ['inside', 'video_kw_inside']]) {
    const words = lines(values[key]);
    if (words.length) kinds[kind] = words;
    else delete kinds[kind];
  }
  const same = first.channel === channel;
  return [{ ...others, ...(same && channelId !== undefined ? { channel_id: channelId } : {}), ...(same && uploadsId !== undefined ? { uploads_playlist_id: uploadsId } : {}), channel, kinds }, ...rest];
}

/** theme_colors は送らない（フェーズ2。FR-92） */
export function clubFromForm(values, original = null) {
  return {
    id: text(values.id), name: text(values.name), short_name: text(values.short_name),
    aliases: lines(values.aliases),
    official_url: blankToNull(values.official_url), jleague_url: blankToNull(values.jleague_url),
    home_stadium_id: blankToNull(values.home_stadium_id),
    video_sources: videoSourcesFromForm(values, original?.video_sources ?? []),
  };
}

/** 登録済みのクラブ → 入力欄の値（取得元は1件目だけ） */
export function clubToValues(club) {
  const src = (club.video_sources ?? [])[0];
  return {
    id: str(club.id), name: str(club.name), short_name: str(club.short_name),
    aliases: (club.aliases ?? []).join('\n'),
    official_url: str(club.official_url), jleague_url: str(club.jleague_url), home_stadium_id: str(club.home_stadium_id),
    video_channel: str(src?.channel),
    video_kw_highlight: (src?.kinds?.highlight ?? []).join('\n'),
    video_kw_inside: (src?.kinds?.inside ?? []).join('\n'),
  };
}
