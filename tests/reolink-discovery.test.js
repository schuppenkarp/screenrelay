import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { recorderAddress } from '../server/routes/reolink.js';

test('recorder addresses accept IP and ports without embedded credentials or paths', () => {
  assert.equal(recorderAddress('192.168.1.20:8080'), 'http://192.168.1.20:8080');
  assert.equal(recorderAddress('https://recorder.local'), 'https://recorder.local');
  for (const value of [
    'ftp://camera',
    'http://admin:secret@camera',
    'http://camera/?ch=4',
    'http://camera/other',
  ])
    assert.throws(() => recorderAddress(value));
});

test('admin can discover and bulk import channels idempotently without exposing passwords', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'reolink-discovery-'));
  let logins = 0;
  const instance = createApp({
    dataDir: dir,
    organizationPreset: 'neutral',
    streamRequest: async (url, options) => {
      assert.equal(options.redirect, 'error');
      const commands = JSON.parse(options.body);
      if (commands[0].cmd === 'Login') {
        logins++;
        assert.equal(commands[0].param.User.password, 'test-secret');
        return Response.json([
          { code: 0, value: { Token: { name: 'secret-token', leaseTime: 3600 } } },
        ]);
      }
      assert.equal(new URL(url).searchParams.get('token'), 'secret-token');
      return Response.json([
        {
          cmd: 'GetChannelstatus',
          code: 0,
          value: {
            status: [
              { channel: 0, name: 'Entrance', online: 1 },
              { channel: 4, name: 'Workshop', online: 1 },
              { channel: 7, name: 'Offline', online: 0 },
            ],
          },
        },
        { cmd: 'GetNetPort', code: 0, value: { NetPort: { rtmpEnable: 1, rtmpPort: 1936 } } },
      ]);
    },
  });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await instance.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const setup = await fetch(base + '/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'long-test-admin-password' }),
  });
  const headers = {
    'Content-Type': 'application/json',
    Cookie: setup.headers.get('set-cookie').split(';')[0],
  };
  const post = (route, body) =>
    fetch(base + route, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(
    (
      await fetch(base + '/api/reolink/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    401,
  );
  const discovered = await post('/api/reolink/channels', {
    address: 'recorder.local',
    username: 'admin',
    password: 'test-secret',
  });
  assert.equal(discovered.status, 200);
  const found = await discovered.json();
  assert.equal(found.channels.length, 3);
  assert.equal(JSON.stringify(found).includes('secret'), false);
  assert.equal(
    (await post('/api/reolink/import', { discoveryId: found.discoveryId, channels: [99] })).status,
    400,
  );
  const imported = await post('/api/reolink/import', {
    discoveryId: found.discoveryId,
    channels: [0, 4],
    addToTouch: true,
    rotation_visible: false,
  });
  assert.deepEqual(await imported.json(), { created: 2, existing: 0 });
  assert.deepEqual(
    await (
      await post('/api/reolink/import', { discoveryId: found.discoveryId, channels: [0, 4] })
    ).json(),
    { created: 0, existing: 2 },
  );
  const cameras = instance.store.items();
  assert.equal(cameras.length, 2);
  assert.equal(
    cameras.every((item) => item.pinned && item.visible && !item.rotation_visible),
    true,
  );
  assert.equal(new URL(cameras[0].stream_url).searchParams.get('port'), '1936');
  assert.equal(instance.store.cameraPassword(cameras[0]), 'test-secret');
  assert.equal(instance.store.settings().touchItemIds.length, 2);
  assert.equal(
    (
      await post('/api/reolink/channels', {
        address: 'another-recorder.local',
        username: 'admin',
        existingItemId: cameras[0].id,
      })
    ).status,
    400,
  );
  assert.equal(logins, 1);
  const again = await post('/api/reolink/channels', {
    address: 'recorder.local',
    username: 'admin',
    existingItemId: cameras[0].id,
  });
  const next = await again.json();
  assert.equal(next.channels.filter((row) => row.existing).length, 2);
  instance.store.set('settings', {
    ...instance.store.settings(),
    touchItemIds: Array.from({ length: 12 }, (_, i) => String(i)),
  });
  assert.equal(
    (
      await post('/api/reolink/import', {
        discoveryId: next.discoveryId,
        channels: [7],
        addToTouch: true,
      })
    ).status,
    400,
  );
  assert.equal(
    instance.store.items().length,
    2,
    'bulk import rolls back when touch selection is full',
  );
});
