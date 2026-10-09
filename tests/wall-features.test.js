import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { defaults } from '../server/store.js';
import { validateSettings } from '../server/validation.js';
import { rewritePlaylist, validateStream, touchItems } from '../server/streams.js';
import { wallLayout, itemsForZone, touchDeadline, portraitPair } from '../public/wall-layout.js';

test('large portraits use adjacent vertical cells across layouts without covering the notice', () => {
  assert.deepEqual(portraitPair(wallLayout(defaults, true)), { top: 0, bottom: 1 });
  for (let columns = 1; columns <= 4; columns++) {
    for (let rows = 1; rows <= 3; rows++) {
      for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'off']) {
        const layout = wallLayout(
          { ...defaults, layoutColumns: columns, layoutRows: rows, noticePosition: position },
          true,
        );
        const pair = portraitPair(layout);
        const candidates = layout.slots.some(
          (slot, index) =>
            index !== layout.noticeIndex &&
            layout.slots.some(
              (other, next) =>
                next !== layout.noticeIndex &&
                other.column === slot.column &&
                other.row === slot.row + 1,
            ),
        );
        assert.equal(Boolean(pair), candidates);
        if (!pair) continue;
        assert.notEqual(pair.top, layout.noticeIndex);
        assert.notEqual(pair.bottom, layout.noticeIndex);
        assert.equal(layout.slots[pair.top].column, layout.slots[pair.bottom].column);
        assert.equal(layout.slots[pair.top].row + 1, layout.slots[pair.bottom].row);
      }
    }
  }
  assert.deepEqual(
    portraitPair(
      wallLayout({ ...defaults, layoutColumns: 3, noticePosition: 'bottom-left' }, true),
    ),
    { top: 1, bottom: 4 },
  );
});

test('flexible layouts reserve the chosen info cell and partition photos without duplicates', () => {
  const layout = wallLayout(
    { ...defaults, layoutColumns: 3, layoutRows: 2, noticePosition: 'bottom-left' },
    true,
  );
  assert.equal(layout.noticeIndex, 3);
  const items = [
    { id: 'camera', type: 'stream', visible: true, pinned: true },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: 'photo' + i,
      type: 'image',
      visible: true,
      pinned: false,
    })),
  ];
  const displayed = layout.slots.flatMap((_, i) => itemsForZone(items, i, layout));
  assert.equal(new Set(displayed.map((item) => item.id)).size, 13);
  assert.equal(displayed.length, 13);
  assert.deepEqual(itemsForZone(items, 3, layout), []);
  assert.equal(
    wallLayout(defaults, true).noticeIndex,
    3,
    'existing 2x2 arrangement stays unchanged',
  );
  assert.equal(
    itemsForZone(
      items,
      0,
      wallLayout({ ...defaults, layoutColumns: 1, layoutRows: 1, noticePosition: 'off' }, true),
    ).length,
    13,
  );
  assert.equal(touchDeadline({ ...defaults, touchDuration: 5 }, 100), 5100);
});

test('settings and camera validation reject unsafe formats and invalid touch choices', () => {
  for (const input of [
    { layoutColumns: 5 },
    { layoutRows: 0 },
    { touchDuration: 0 },
    { touchItemIds: ['not-an-id'] },
    { noticePosition: 'middle' },
  ])
    assert.throws(() => validateSettings(input, defaults));
  for (const stream_url of ['rtsp://camera/live', 'file:///etc/passwd', 'javascript:alert(1)'])
    assert.throws(() => validateStream({ title: 'Camera', stream_url }));
  const root = new URL('http://camera.local/live/index.m3u8');
  assert.throws(() =>
    rewritePlaylist('#EXTM3U\nhttps://other.example/part.ts', root, root, (x) => x),
  );
  assert.throws(() => rewritePlaylist('not a playlist', root, root, (x) => x));
  const selected = touchItems(
    [
      { id: 'a', type: 'stream', pinned: true, visible: true, stream_url: 'secret' },
      { id: 'b', pinned: true, visible: false },
      { id: 'c', pinned: false, visible: true },
    ],
    { touchItemIds: ['a', 'b', 'c', 'deleted'] },
  );
  assert.equal(selected.length, 1);
  assert.equal(selected[0].stream_url, undefined);
});

test('camera API protects sources, proxies HLS assets and keeps touch-only cameras out of rotation', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wall-stream-'));
  const upstream = [];
  const instance = createApp({
    dataDir: dir,
    organizationPreset: 'neutral',
    streamRequest: async (url, options) => {
      upstream.push({ url: String(url), authorization: options.headers.Authorization });
      if (String(url).endsWith('index.m3u8'))
        return new Response(
          '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:1,\npart.ts?token=private-token\n',
          { headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
        );
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'application/octet-stream' },
      });
    },
  });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await instance.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const setup = await fetch(base + '/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'a-long-test-password' }),
  });
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  assert.equal(
    (
      await fetch(base + '/api/items/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    401,
  );
  const created = await fetch(base + '/api/items/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Workshop',
      stream_url: 'http://user:password@camera.local/live/index.m3u8',
      stream_kind: 'hls',
      rotation_visible: false,
    }),
  });
  assert.equal(created.status, 201);
  const item = await created.json();
  assert.equal(item.stream_url, 'http://camera.local/live/index.m3u8');
  assert.equal(item.stream_username, 'user');
  assert.equal(item.stream_password_set, true);
  assert.equal(item.stream_password_cipher, undefined);
  assert.equal(item.stream_password, undefined);
  const saved = await fetch(base + '/api/items/' + item.id, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ title: 'Renamed camera', stream_password: '' }),
  });
  assert.equal((await saved.json()).stream_password_set, true);
  const adminState = await (await fetch(base + '/api/admin/state', { headers })).json();
  const exposedCamera = adminState.items.find((value) => value.id === item.id);
  assert.equal(exposedCamera.stream_password_cipher, undefined);
  assert.equal(exposedCamera.stream_password, undefined);
  assert.equal(new URL(exposedCamera.stream_url).password, '');
  assert.equal((await fetch(base + item.url)).status, 401);
  const settings = await fetch(base + '/api/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      touchEnabled: true,
      touchItemIds: [item.id],
      touchDuration: 5,
      layoutColumns: 3,
    }),
  });
  assert.equal(settings.status, 200);
  const feed = await (
    await fetch(base + '/api/display/feed', { headers: { Cookie: cookie } })
  ).json();
  assert.equal(feed.items.length, 0);
  assert.equal(feed.touchItems.length, 1);
  assert.equal(JSON.stringify(feed).includes('password'), false);
  assert.equal(JSON.stringify(feed).includes('camera.local'), false);
  const playlist = await (await fetch(base + item.url, { headers: { Cookie: cookie } })).text();
  assert.equal(playlist.includes('private-token'), false);
  assert.equal(playlist.includes('camera.local'), false);
  const segment = playlist.split('\n').find((line) => line.startsWith('/api/streams/'));
  assert.equal((await fetch(base + segment, { headers: { Cookie: cookie } })).status, 200);
  assert.ok(
    upstream.every(
      (call) => call.authorization === 'Basic ' + Buffer.from('user:password').toString('base64'),
    ),
  );
  assert.ok(upstream.every((call) => !call.url.includes('user:password')));
  const changed = await fetch(base + '/api/items/' + item.id, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      stream_kind: 'mjpeg',
      stream_url: 'http://camera.local/video.mjpg',
      visible: false,
    }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).stream_kind, 'mjpeg');
  const link = await (
    await fetch(base + '/api/display-link', { headers: { Cookie: cookie } })
  ).json();
  const pairing = await fetch(base + '/api/display/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: new URL(link.path, base).searchParams.get('token') }),
  });
  const viewer = pairing.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + item.url, { headers: { Cookie: viewer } })).status, 404);
  assert.equal(
    (
      await fetch(base + '/api/items/stream', {
        method: 'POST',
        headers: { ...headers, Cookie: viewer },
        body: '{}',
      })
    ).status,
    401,
  );
});
