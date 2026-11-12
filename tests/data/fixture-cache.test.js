import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixtureCache } from '../../src/data/fixture-cache.js';
import { fakeClient } from '../helpers/fake-supabase.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

test('読み込み中は undefined、読めたら fixture。同じ id は通信1回。読み終わったら onChange', async () => {
  const client = fakeClient({ fixtures: [{ id: 'old1', kickoff: '14:00:00' }] });
  let changed = 0;
  const cache = createFixtureCache({ client: () => client, onChange: () => { changed++; } });
  assert.equal(cache.get('old1'), undefined);
  assert.equal(cache.get('old1'), undefined);
  await tick();
  assert.equal(changed, 1);
  assert.equal(cache.get('old1').kickoff, '14:00');
  assert.equal(cache.get('old1').id, 'old1');
  assert.equal(client.calls.filter((c) => c.table === 'fixtures').length, 1);
});

test('試合がない・通信できないときは null を覚え、もう読まない。forget で読み直す', async () => {
  const client = fakeClient({ fixtures: [] });
  const cache = createFixtureCache({ client: () => client, onChange: () => {} });
  cache.get('none');
  await tick();
  assert.equal(cache.get('none'), null);
  assert.equal(client.calls.length, 1);
  const down = fakeClient({}, { throwOn: ['fixtures'] });
  const c2 = createFixtureCache({ client: () => down, onChange: () => {} });
  c2.get('x');
  await tick();
  assert.equal(c2.get('x'), null);
  cache.forget('none');
  assert.equal(cache.get('none'), undefined);
});

test('reset：覚えた値を全部捨て、次の get で読み直す。reset 前に始めた読み込みの結果は採用しない（M-4）', async () => {
  const client = fakeClient({ fixtures: [{ id: 'old1', kickoff: '14:00:00' }, { id: 'old2', kickoff: '15:00:00' }] });
  const cache = createFixtureCache({ client: () => client, onChange: () => {} });
  cache.get('old1');
  await tick();
  assert.equal(cache.get('old1').id, 'old1');
  cache.get('old2'); // 読み込み中
  cache.reset();
  await tick();
  assert.equal(cache.get('old1'), undefined); // 捨てられた（また読む）
  await tick();
  assert.equal(cache.get('old1').id, 'old1');
  assert.equal(client.calls.filter((c) => c.table === 'fixtures').length, 3); // old1・old2（reset 前）・old1（reset 後）
});
