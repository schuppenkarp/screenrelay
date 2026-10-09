import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/store.js';
import { cameraSecrets } from '../server/camera-secrets.js';
import { validateStream } from '../server/streams.js';

test('legacy URL credentials migrate to encrypted storage and survive restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'camera-secrets-'));
  let store;
  try {
    store = openStore(dir);
    store.db
      .prepare(
        "INSERT INTO items(id,type,title,source,created,stream_url,stream_kind) VALUES ('cam','stream','Test','admin',0,?,'reolink')",
      )
      .run('http://admin:uniqueSecret%23%24@camera.local/flv?stream=channel4_sub.bcs');
    store.close();
    store = openStore(dir);
    const item = store.item('cam');
    assert.equal(item.stream_url, 'http://camera.local/flv?stream=channel4_sub.bcs');
    assert.equal(item.stream_username, 'admin');
    assert.match(item.stream_password_cipher, /^v1\./);
    assert.equal(store.cameraPassword(item), 'uniqueSecret#$');
    assert.equal(
      store.cameraPassword(store.protectStream(validateStream({ stream_password: '' }, item))),
      'uniqueSecret#$',
    );
    assert.equal(
      store.cameraPassword(
        store.protectStream(validateStream({ stream_password: 'replacement' }, item)),
      ),
      'replacement',
    );
    store.close();
    store = undefined;
    assert.equal(
      (await readFile(path.join(dir, 'wall.sqlite'))).includes(Buffer.from('uniqueSecret')),
      false,
    );
    await unlink(path.join(dir, 'camera-secrets.key'));
    assert.throws(() => cameraSecrets(dir, true), /Schlüssel fehlt/);
  } finally {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('camera encryption rejects altered ciphertext and uses distinct nonces', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'camera-vault-'));
  try {
    const secrets = cameraSecrets(dir);
    const first = secrets.encrypt('test password');
    assert.notEqual(first, secrets.encrypt('test password'));
    const fields = first.split('.');
    fields[3] = Buffer.from('tampered').toString('base64');
    assert.throws(() => secrets.decrypt(fields.join('.')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
