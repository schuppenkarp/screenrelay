import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';
import { mediaService } from '../server/media.js';
import { importMessage, acknowledge } from '../server/import-message.js';

test('admin lifecycle, private media, viewer permissions, persistence and revocation', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bilderwand-api-'));
  const instance = createApp({
    dataDir: dir,
    calendarRequest: async () => new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'),
  });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await instance.close();
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (url, { method = 'GET', body, cookie, origin } = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  assert.equal((await request('/api/admin/state')).status, 401);
  assert.equal((await request('/api/updates')).status, 401);
  assert.equal((await request('/api/drive')).status, 401);
  assert.equal((await request('/api/drive/callback?state=invalid&code=invalid')).status, 403);
  assert.equal((await request('/api/display/feed')).status, 401);
  assert.equal(
    (
      await request('/api/setup', {
        method: 'POST',
        body: { password: 'long-password-123' },
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  const setup = await request('/api/setup', {
    method: 'POST',
    body: { password: 'long-password-123' },
  });
  assert.equal(setup.status, 200);
  const cookie = setup.cookie;
  const driveSettings = await request('/api/drive', {
    method: 'PUT',
    cookie,
    body: {
      clientId: 'local-test.apps.googleusercontent.com',
      clientSecret: 'secret-test',
      enabled: false,
      cacheOnly: false,
    },
  });
  assert.equal(driveSettings.status, 200);
  assert.equal(JSON.stringify(driveSettings.body).includes('secret-test'), false);
  const driveConnect = await request('/api/drive/connect', { method: 'POST', cookie });
  assert.equal(driveConnect.status, 200);
  assert.ok(driveConnect.cookie.startsWith('wall_drive_oauth='));
  const oauthURL = new URL(driveConnect.body.url);
  assert.equal(oauthURL.searchParams.get('redirect_uri'), base + '/api/drive/callback');
  assert.equal(
    (
      await request(
        '/api/drive/callback?state=' + oauthURL.searchParams.get('state') + '&code=fake',
        { cookie },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request('/api/setup', { method: 'POST', body: { password: 'another-password' } }))
      .status,
    409,
  );
  assert.equal(
    (await request('/api/login', { method: 'POST', body: { password: 'wrong' } })).status,
    401,
  );
  const settings = await request('/api/settings', {
    method: 'PUT',
    cookie,
    body: { photoDuration: 4, pinInterval: 2, transition: 'slide' },
  });
  assert.equal(settings.status, 200);
  const created = await request('/api/items/text', {
    method: 'POST',
    cookie,
    body: { title: 'Werkstatt', body: 'Freitag ab 18 Uhr', duration: 35, pinned: true },
  });
  assert.equal(created.status, 201);
  const image = await sharp({
    create: { width: 50, height: 40, channels: 3, background: '#204a40' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('image', new Blob([image], { type: 'image/png' }), 'example.png');
  const uploadResponse = await fetch(base + '/api/items/upload', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  instance.store.db.prepare('UPDATE items SET display_rotation=90 WHERE id=?').run(uploaded.id);
  const rotated = await fetch(base + instance.store.item(uploaded.id).url, {
    headers: { Cookie: cookie },
  });
  const rotatedMetadata = await sharp(Buffer.from(await rotated.arrayBuffer())).metadata();
  assert.equal(rotatedMetadata.width, 40);
  assert.equal(rotatedMetadata.height, 50);
  const storedMetadata = await sharp(path.join(dir, 'media', uploaded.file)).metadata();
  assert.equal(storedMetadata.width, 50);
  assert.equal(storedMetadata.height, 40);
  assert.equal(
    (
      await request(`/api/items/${uploaded.id}/rotate`, {
        method: 'POST',
        body: { direction: 'right' },
      })
    ).status,
    401,
  );
  instance.store.db.prepare('UPDATE items SET display_rotation=0 WHERE id=?').run(uploaded.id);
  const manualRotation = await request(`/api/items/${uploaded.id}/rotate`, {
    method: 'POST',
    cookie,
    body: { direction: 'right' },
  });
  assert.equal(manualRotation.body.display_rotation, 90);
  const rotatedImage = await fetch(base + manualRotation.body.url, { headers: { Cookie: cookie } });
  const rotatedSize = await sharp(Buffer.from(await rotatedImage.arrayBuffer())).metadata();
  assert.equal(rotatedSize.width, 40);
  assert.equal(rotatedSize.height, 50);
  await request(`/api/items/${uploaded.id}/rotate`, {
    method: 'POST',
    cookie,
    body: { direction: 'left' },
  });
  const link = await request('/api/display-link', { cookie });
  const token = new URL(link.body.path, base).searchParams.get('token');
  const invalidLink = await fetch(base + '/display?token=wrong', { redirect: 'manual' });
  assert.equal(invalidLink.status, 403);
  const queryLogin = await fetch(base + link.body.path, { redirect: 'manual' });
  assert.equal(queryLogin.status, 303);
  assert.equal(queryLogin.headers.get('location'), '/display');
  assert.equal(queryLogin.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(queryLogin.headers.get('cache-control'), 'no-store');
  assert.match(queryLogin.headers.get('set-cookie'), /HttpOnly/);
  const queryCookie = queryLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/display/feed', { cookie: queryCookie })).status, 200);
  assert.equal((await request('/api/admin/state', { cookie: queryCookie })).status, 401);
  assert.equal((await request('/api/viewer-tokens')).status, 401);
  assert.equal((await request('/api/viewer-tokens', { cookie: queryCookie })).status, 401);
  const extra = await request('/api/viewer-tokens', {
    method: 'POST',
    cookie,
    body: { name: 'Empfang' },
  });
  assert.equal(extra.status, 201);
  const extraLogin = await fetch(base + extra.body.path, { redirect: 'manual' });
  const extraCookie = extraLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/display/feed', { cookie: extraCookie })).status, 200);
  assert.equal(
    instance.store.db
      .prepare("SELECT MIN(expires) AS expiry FROM sessions WHERE role='display'")
      .get().expiry,
    Number.MAX_SAFE_INTEGER,
  );
  await request('/api/viewer-tokens/' + extra.body.id, { method: 'DELETE', cookie });
  assert.equal((await request('/api/display/feed', { cookie: extraCookie })).status, 401);
  assert.equal((await fetch(base + extra.body.path, { redirect: 'manual' })).status, 403);
  assert.equal((await request('/api/display/feed', { cookie: queryCookie })).status, 200);
  assert.equal((await request('/api/display/feed', { cookie })).status, 200);
  const pairing = await request('/api/display/session', { method: 'POST', body: { token } });
  const viewer = pairing.cookie;
  instance.store.db
    .prepare('UPDATE items SET hide_caption=1,body=? WHERE id=?')
    .run('#bilderwand Beispieltext', uploaded.id);
  assert.equal(pairing.status, 200);
  assert.equal((await request('/api/admin/state', { cookie: viewer })).status, 401);
  const feed = await request('/api/display/feed', { cookie: viewer });
  assert.equal(feed.body.items.find((item) => item.id === uploaded.id).body, '');
  assert.equal(feed.body.items.find((item) => item.id === uploaded.id).title, '');
  assert.equal(instance.store.item(uploaded.id).body, '#bilderwand Beispieltext');
  assert.equal(feed.body.items.length, 2);
  assert.equal(feed.body.settings.photoDuration, 4);
  assert.equal(feed.body.settings.groupId, undefined);
  assert.equal((await fetch(base + uploaded.url)).status, 401);
  assert.equal((await fetch(base + uploaded.url, { headers: { Cookie: viewer } })).status, 200);
  await request(`/api/items/${uploaded.id}`, { method: 'PATCH', cookie, body: { visible: false } });
  assert.equal((await fetch(base + uploaded.url, { headers: { Cookie: viewer } })).status, 404);
  assert.equal((await request('/api/display/feed', { cookie: viewer })).body.items.length, 1);
  assert.equal(
    (await request('/api/settings', { method: 'PUT', cookie: viewer, body: { photoDuration: 5 } }))
      .status,
    401,
  );
  assert.equal(
    (await request('/api/settings', { method: 'PUT', cookie, body: { photoDuration: -1 } })).status,
    400,
  );
  const second = openStore(dir);
  assert.equal(second.settings().photoDuration, 4);
  assert.equal(second.items().length, 2);
  second.close();
  await request('/api/display-link/rotate', { method: 'POST', cookie });
  assert.equal((await request('/api/display/feed', { cookie: queryCookie })).status, 401);
  assert.equal((await fetch(base + link.body.path, { redirect: 'manual' })).status, 403);
  assert.equal((await request('/api/display/feed', { cookie: viewer })).status, 401);
  assert.equal(
    (await request('/api/display/session', { method: 'POST', body: { token } })).status,
    403,
  );
  const login = await request('/api/login', {
    method: 'POST',
    body: { password: 'long-password-123' },
  });
  assert.equal(login.status, 200);
  const passwordChange = await request('/api/password', {
    method: 'POST',
    cookie,
    body: { oldPassword: 'long-password-123', password: 'changed-password-123' },
  });
  assert.equal(passwordChange.status, 200);
  assert.equal((await request('/api/admin/state', { cookie: login.cookie })).status, 401);
  await request(`/api/items/${uploaded.id}`, { method: 'DELETE', cookie: passwordChange.cookie });
  assert.equal(
    (await fetch(base + uploaded.url, { headers: { Cookie: passwordChange.cookie } })).status,
    404,
  );
});

test('WhatsApp saves before thumbs-up, rejects other chats and retries failed reactions without duplicate import', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bilderwand-wa-'));
  let store = openStore(dir);
  const media = mediaService(store, dir);
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  store.set('settings', {
    ...store.settings(),
    whatsappEnabled: true,
    groupId: 'group@g.us',
    moderation: true,
  });
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } })
    .jpeg()
    .toBuffer();
  let reactions = [],
    failReaction = true,
    downloads = 0;
  const message = {
    from: 'group@g.us',
    to: 'account',
    fromMe: false,
    hasMedia: true,
    type: 'image',
    id: { _serialized: 'message-1' },
    body: 'Foto',
    downloadMedia: async () => {
      downloads++;
      return { mimetype: 'image/jpeg', data: image.toString('base64') };
    },
    react: async (emoji) => {
      assert.equal(store.items().length, 1, 'must be saved before reacting');
      if (failReaction) throw new Error('offline');
      reactions.push(emoji);
    },
  };
  assert.equal(await importMessage({ ...message, from: 'other@g.us' }, store, media), null);
  assert.equal(await importMessage({ ...message, isViewOnce: true }, store, media), null);
  const saved = await importMessage(message, store, media);
  assert.equal(saved.visible, false);
  assert.deepEqual(reactions, []);
  await assert.rejects(() => acknowledge(message, store));
  assert.equal(store.db.prepare('SELECT reacted FROM receipts').get().reacted, 0);
  assert.equal(await importMessage(message, store, media), null);
  assert.equal(downloads, 1);
  // Re-open the DB: a failed reaction survives a process restart.
  store.close();
  store = openStore(dir);
  failReaction = false;
  await acknowledge(message, store);
  await acknowledge(message, store);
  assert.deepEqual(reactions, ['👍']);
  const newMedia = mediaService(store, dir);
  await newMedia.remove(saved.id);
  assert.equal(
    await importMessage(message, store, newMedia),
    null,
    'deleted photos must not be resurrected by a replay',
  );
  const broken = {
    ...message,
    id: { _serialized: 'message-2' },
    downloadMedia: async () => ({
      mimetype: 'image/jpeg',
      data: Buffer.from('invalid').toString('base64'),
    }),
  };
  await assert.rejects(() => importMessage(broken, store, newMedia));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n, 1);
  assert.deepEqual(reactions, ['👍']);
  await assert.rejects(
    () =>
      importMessage(
        {
          ...message,
          id: { _serialized: 'download-failed' },
          downloadMedia: async () => {
            throw new Error('network unavailable');
          },
        },
        store,
        newMedia,
      ),
    /WhatsApp-Download fehlgeschlagen: network unavailable/,
  );
  await assert.rejects(
    () =>
      importMessage(
        { ...message, id: { _serialized: 'media-missing' }, downloadMedia: async () => undefined },
        store,
        newMedia,
      ),
    /stellt die Bilddatei derzeit nicht bereit/,
  );
});

test('production setup requires a secret and enforces it', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bilderwand-setup-'));
  assert.throws(() => createApp({ dataDir: dir, production: true }), /SETUP_KEY/);
  const instance = createApp({ dataDir: dir, production: true, setupKey: 'a'.repeat(48) });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await instance.close();
    await rm(dir, { recursive: true, force: true });
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'long-password-123', setupKey: 'wrong' }),
  });
  assert.equal(response.status, 403);
});
