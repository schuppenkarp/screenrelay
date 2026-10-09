import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../server/store.js';
import { mediaService } from '../server/media.js';
import { deleteByReaction } from '../server/delete-reaction.js';

test('red cross deletes only selected-group photos, including pins, and prevents reimport', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wall-reaction-'));
  const store = openStore(dir),
    media = mediaService(store, dir);
  try {
    store.set('settings', { ...store.settings(), whatsappEnabled: true, groupId: 'group@g.us' });
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const messageId = 'false_group@g.us_photo';
    const item = await media.add(buffer, {
      source: 'whatsapp',
      messageId,
      groupId: 'group@g.us',
      pinned: true,
    });
    const reaction = {
      reaction: '❌',
      msgId: { fromMe: false, remote: 'group@g.us', id: 'photo' },
    };
    assert.equal(await deleteByReaction({ ...reaction, reaction: '👍' }, store, media), false);
    assert.equal(await deleteByReaction(reaction, store, media, () => false), false);
    store.set('settings', { ...store.settings(), groupId: 'other@g.us' });
    assert.equal(await deleteByReaction(reaction, store, media), false);
    store.set('settings', { ...store.settings(), groupId: 'group@g.us' });
    assert.equal(await deleteByReaction(reaction, store, media), true);
    assert.equal(store.item(item.id), undefined);
    await assert.rejects(access(path.join(dir, 'media', item.file)));
    await access(path.join(dir, 'deleted', item.file));
    assert.deepEqual(await readFile(path.join(dir, 'deleted', item.original_file)), buffer);
    const archived = JSON.parse(
      await readFile(path.join(dir, 'deleted', `${item.id}.json`), 'utf8'),
    );
    assert.equal(archived.message_id, messageId);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM archived_items').get().n, 1);
    assert.equal(await deleteByReaction(reaction, store, media), false);
    assert.equal(
      await media.add(buffer, { source: 'whatsapp', messageId, groupId: 'group@g.us' }),
      null,
    );
    assert.equal(
      store.db.prepare('SELECT reacted FROM receipts WHERE message_id=?').get(messageId).reacted,
      1,
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
