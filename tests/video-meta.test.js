import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oembedUrl, videoMetaFromOembed } from '../src/core/video-meta.js';

test('oembedUrl は動画の URL を oEmbed の問い合わせにする', () => {
  assert.equal(
    oembedUrl('https://www.youtube.com/watch?v=abc123'),
    'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123',
  );
  assert.equal(
    oembedUrl('https://youtu.be/abc123'),
    'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2Fabc123',
  );
  // YouTube 以外・読めない URL は問い合わせない
  assert.equal(oembedUrl('https://example.com/watch?v=abc'), null);
  assert.equal(oembedUrl('not a url'), null);
  assert.equal(oembedUrl(null), null);
});

test('videoMetaFromOembed はタイトルとチャンネル（@ハンドル）を取り出す', () => {
  assert.deepEqual(
    videoMetaFromOembed({ title: ' 【ハイライト】架空 vs 松本 ', author_name: '架空チャンネル', author_url: 'https://www.youtube.com/@kaku-ch' }),
    { title: '【ハイライト】架空 vs 松本', channel: '@kaku-ch' },
  );
  // ハンドルがなければチャンネル名
  assert.deepEqual(
    videoMetaFromOembed({ title: 'T', author_name: '架空チャンネル', author_url: 'https://www.youtube.com/channel/UC123' }),
    { title: 'T', channel: '架空チャンネル' },
  );
});

test('videoMetaFromOembed は形が違えば null を返し、長すぎる文字は切る', () => {
  assert.deepEqual(videoMetaFromOembed(null), { title: null, channel: null });
  assert.deepEqual(videoMetaFromOembed({ title: 1, author_name: [] }), { title: null, channel: null });
  assert.deepEqual(videoMetaFromOembed({ title: '  ', author_name: '' }), { title: null, channel: null });
  assert.equal(videoMetaFromOembed({ title: 'あ'.repeat(300) }).title.length, 200);
});
