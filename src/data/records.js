// 観戦記録・試合の情報の保存（設計書 4.1・4.2・9章）。user_id・visibility は送らない（DB の既定値）。失敗の理由は toFormError（D34）
// 写真（4.2.1）：photos（createPhotoStore）を渡すと、記録 → 写真 → photo_path の順で保存できる
import { validateMatchRecord, validateFixtureEdit, COST_KEYS } from '../core/record-form.js';
import { toFormError, FORM_MESSAGES } from './errors.js';
import { PHOTO_UPLOAD_FAILED } from './photos.js';

const fail = (e) => {
  const r = toFormError(e);
  return r === 'expired' ? 'expired' : { ok: false, errors: r };
};

const SHRINK_FAILED = '写真を縮小できませんでした';

// photo_path は photoPath を渡されたときだけ送る（ふつうの保存で送ると既存の写真を消してしまう）。null は写真を外す
function recordRow(record, photoPath) {
  const row = {
    fixture_id: record.fixture_id,
    trip_id: record.trip_id ?? null,
    watch_style: record.watch_style,
    memo: record.memo ?? null,
  };
  for (const k of COST_KEYS) row[k] = record[k] ?? null;
  if (photoPath !== undefined) row.photo_path = photoPath;
  return row;
}

export function createRecordStore({ client, photos = null }) {
  // 手入力で保存する動画（種類ごと）。URL があれば upsert、空なら手入力の行だけ消す（自動の動画は消さない）
  async function saveVideo(fixtureId, kind, url) {
    const q = url
      ? client.from('fixture_videos').upsert({ fixture_id: fixtureId, kind, url, source: 'manual' }, { onConflict: 'fixture_id,kind' })
      : client.from('fixture_videos').delete().eq('fixture_id', fixtureId).eq('kind', kind).eq('source', 'manual');
    return q;
  }

  const store = {
    async save(record, { photoPath } = {}) {
      const v = validateMatchRecord(record);
      if (!v.ok) return { ok: false, errors: v.errors };
      try {
        const { data, error } = await client.from('match_records').upsert(recordRow(record, photoPath), { onConflict: 'user_id,fixture_id' }).select().single();
        if (error) return fail(error);
        return { ok: true, id: data?.id };
      } catch (e) {
        return fail(e);
      }
    },
    // 写真だけやり直す：縮小 → アップロード → photo_path を入れて保存。失敗は { ok: false, errors: { photo } }
    async attachPhoto(record, makeBlob) {
      let blob;
      try {
        blob = await makeBlob();
      } catch {
        return { ok: false, errors: { photo: SHRINK_FAILED } };
      }
      const up = await photos.upload(record.fixture_id, blob);
      if (up === 'expired' || !up.ok) return up;
      const res = await store.save(record, { photoPath: up.path });
      if (res === 'expired') return res;
      return res.ok ? res : { ok: false, errors: { photo: PHOTO_UPLOAD_FAILED } };
    },
    // 記録を保存し、写真（makeBlob）を選んでいれば続けて上げる。写真だけ失敗したら記録は保存したまま photoError を返す（9章）
    async saveWithPhoto(record, makeBlob) {
      const saved = await store.save(record);
      if (saved === 'expired' || !saved.ok || !makeBlob) return saved;
      const att = await store.attachPhoto(record, makeBlob);
      if (att === 'expired') return att;
      return att.ok ? saved : { ...saved, photoError: att.errors.photo };
    },
    // 写真を外す：photo_path を外してからファイルを消す（ファイルの削除の失敗は成功扱い）。record は保存済みの記録
    async removePhoto(record) {
      const path = record.photo_path;
      const res = await store.save(record, { photoPath: null });
      if (res === 'expired' || !res.ok) return res;
      if (path && photos) await photos.remove(path);
      return { ok: true };
    },
    // 記録を消し、写真（photoPath）も消す。写真の削除の失敗では記録の削除を止めない
    async remove(id, photoPath = null) {
      try {
        const { error } = await client.from('match_records').delete().eq('id', id);
        if (error) return fail(error);
      } catch (e) {
        return fail(e);
      }
      if (photoPath && photos) await photos.remove(photoPath);
      return { ok: true };
    },
    // 管理者だけ（RLS）。保存すると result_source は 'manual' になり、自動の取り込みで上書きされない
    async saveFixtureInfo(fixtureId, edit, { homeClubId, awayClubId }) {
      const v = validateFixtureEdit(edit, { homeClubId, awayClubId });
      if (!v.ok) return { ok: false, errors: v.errors };
      const f = edit.fixture;
      const values = {
        status: f.status,
        home_score: f.home_score,
        away_score: f.away_score,
        scorers: f.scorers.map((s) => ({ club_id: s.side === 'home' ? homeClubId : awayClubId, player: s.player, minute: s.minute, type: s.type })),
        result_source: 'manual',
      };
      try {
        const { data, error } = await client.from('fixtures').update(values).eq('id', fixtureId).select();
        if (error) return fail(error);
        // RLS で守られた更新は、権限がないとエラーにならず 0 行になる
        if (!data || data.length === 0) return { ok: false, errors: { _form: FORM_MESSAGES.forbidden } };
        for (const kind of ['highlight', 'inside']) {
          const res = await saveVideo(fixtureId, kind, edit.videos[kind]);
          if (res.error) return fail(res.error);
        }
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
  };
  return store;
}
