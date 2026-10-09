import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { openStore } from '../server/store.js';
import { mediaService } from '../server/media.js';
import { driveService } from '../server/drive.js';

function mockDrive() {
  const files = new Map(),
    uploads = new Map();
  let seq = 0,
    fail = false,
    badChecksum = false;
  const response = (data, status = 200, headers = {}) =>
    new Response(JSON.stringify(data), { status, headers });
  return {
    files,
    setFail: (v) => {
      fail = v;
    },
    setBadChecksum: (v) => {
      badChecksum = v;
    },
    async request(url, options = {}) {
      const u = new URL(url),
        method = options.method || 'GET';
      if (u.hostname === 'oauth2.googleapis.com')
        return response({
          refresh_token: 'private-refresh',
          access_token: 'private-access',
          expires_in: 3600,
        });
      if (fail) return response({}, 503);
      if (u.pathname.startsWith('/resumable/')) {
        const id = u.pathname.split('/').pop(),
          metadata = uploads.get(id),
          buffer = Buffer.from(options.body);
        const file = {
          ...metadata,
          id,
          buffer,
          md5Checksum: badChecksum ? 'incorrect' : createHash('md5').update(buffer).digest('hex'),
          size: String(buffer.length),
        };
        files.set(id, file);
        return response({ id, md5Checksum: file.md5Checksum, size: file.size });
      }
      if (u.pathname.startsWith('/upload/')) {
        const id = u.pathname.split('/')[5] || 'id' + ++seq,
          previous = files.get(id) || {},
          metadata = { ...previous, ...JSON.parse(options.body) };
        if (u.searchParams.get('addParents')) metadata.parents = [u.searchParams.get('addParents')];
        uploads.set(id, metadata);
        return response({}, 200, { location: 'https://www.googleapis.com/resumable/' + id });
      }
      if (u.pathname === '/drive/v3/files' && method === 'GET') {
        const key = u.searchParams.get('q').match(/value='([^']+)'/)[1];
        return response({
          files: [...files.values()]
            .filter((f) => f.appProperties?.wallAsset === key)
            .map(({ id, parents, md5Checksum, size }) => ({ id, parents, md5Checksum, size })),
        });
      }
      if (u.pathname === '/drive/v3/files' && method === 'POST') {
        const id = 'id' + ++seq,
          metadata = JSON.parse(options.body);
        files.set(id, { ...metadata, id });
        return response({ id });
      }
      const id = u.pathname.split('/').pop(),
        file = files.get(id);
      if (!file) return response({}, 404);
      if (u.searchParams.get('alt') === 'media') return new Response(file.buffer);
      if (method === 'PATCH') {
        file.parents = [u.searchParams.get('addParents')];
        return response({ id });
      }
      throw Error('Unexpected mock request ' + method + ' ' + u.pathname);
    },
  };
}
test('Drive archives all states, moves without duplicates, restores cache and keeps files on failure', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wall-drive-')),
    store = openStore(dir),
    mock = mockDrive(),
    drive = driveService(store, dir, mock.request),
    media = mediaService(store, dir);
  media.ensureLocal = (item) => drive.ensureLocal(item);
  drive.evictLocal = (id) => media.evictInactiveOriginal(id);
  try {
    const image = await sharp({ create: { width: 12, height: 16, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const active = await media.add(image, { title: 'Active' }),
      inactive = await media.add(image, { title: 'Inactive', visible: false }),
      deleted = await media.add(image, { title: 'Deleted' });
    await media.remove(deleted.id);
    await drive.configure({
      clientId: 'test.apps.googleusercontent.com',
      clientSecret: 'private-secret',
      enabled: false,
    });
    const auth = new URL(await drive.authorize('http://127.0.0.1:3000/api/drive/callback'));
    assert.equal(auth.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
    assert.ok(auth.searchParams.get('code_challenge'));
    await assert.rejects(drive.exchange({ state: 'wrong', code: 'fake' }));
    await drive.exchange({ state: auth.searchParams.get('state'), code: 'fake' });
    await drive.configure({ enabled: true, cacheOnly: true });
    await drive.sync();
    assert.equal(drive.state().error, null);
    assert.equal(drive.state().assets, 9);
    assert.equal(JSON.stringify(drive.state()).includes('private-'), false);
    await assert.rejects(access(path.join(dir, 'deleted', deleted.file)), { code: 'ENOENT' });
    await assert.rejects(access(path.join(dir, 'originals', inactive.original_file)), {
      code: 'ENOENT',
    });
    const count = mock.files.size;
    await drive.sync();
    assert.equal(mock.files.size, count);
    const originalAsset = store.db
      .prepare("SELECT * FROM drive_assets WHERE item_id=? AND kind='original'")
      .get(active.id);
    await unlink(path.join(dir, 'originals', active.original_file));
    await drive.ensureLocal(active);
    assert.deepEqual(await readFile(path.join(dir, 'originals', active.original_file)), image);
    store.db.prepare('UPDATE items SET visible=0 WHERE id=?').run(active.id);
    await drive.sync();
    assert.equal(mock.files.size, count);
    const moved = store.db
      .prepare("SELECT * FROM drive_assets WHERE item_id=? AND kind='original'")
      .get(active.id);
    assert.equal(moved.remote_id, originalAsset.remote_id);
    assert.notEqual(moved.parent, originalAsset.parent);
    await media.remove(active.id);
    await drive.sync();
    assert.equal(drive.state().error, null);
    const newest = await media.add(image, { title: 'Pending' });
    await media.remove(newest.id);
    mock.setFail(true);
    await drive.sync();
    assert.match(drive.state().error, /503/);
    await access(path.join(dir, 'deleted', newest.file));
    mock.setFail(false);
    mock.setBadChecksum(true);
    await drive.sync();
    assert.match(drive.state().error, /Dateiprüfung/);
    await access(path.join(dir, 'deleted', newest.file));
  } finally {
    await drive.close();
    store.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
