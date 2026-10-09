import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../server/store.js';
import { mediaService } from '../server/media.js';
import { rotateImage, rotateByReaction } from '../server/rotate-image.js';

test('manual and reaction rotation preserve original, respect group selection and deduplicate replay', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wall-rotate-'));
  const store = openStore(dir),
    media = mediaService(store, dir);
  try {
    store.set('settings', { whatsappEnabled: true, groupId: 'group@g.us' });
    const buffer = await sharp({ create: { width: 4, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const item = await media.add(buffer, {
      source: 'whatsapp',
      messageId: 'false_group@g.us_photo',
      groupId: 'group@g.us',
    });
    store.db.prepare('UPDATE items SET crop_focus=? WHERE id=?').run('[0,0,1,1]', item.id);
    assert.equal(rotateImage(store, item.id, 'left').display_rotation, 270);
    assert.equal(store.item(item.id).rotation_manual, 1);
    assert.equal(store.item(item.id).crop_focus, null);
    assert.equal(rotateImage(store, item.id, 'right').display_rotation, 0);
    assert.throws(() => rotateImage(store, item.id, 'invalid'));
    const reaction = {
      reaction: '↪️',
      msgId: { fromMe: false, remote: 'group@g.us', id: 'photo' },
      senderId: 'sender',
      timestamp: 1000,
    };
    assert.equal(
      rotateByReaction(reaction, store, () => false),
      false,
    );
    assert.equal(rotateByReaction(reaction, store), true);
    assert.equal(store.item(item.id).display_rotation, 90);
    assert.equal(rotateByReaction(reaction, store), false);
    assert.equal(rotateByReaction({ ...reaction, reaction: '' }, store), false);
    assert.equal(rotateByReaction({ ...reaction, timestamp: 1001 }, store), true);
    assert.equal(store.item(item.id).display_rotation, 180);
    assert.equal(rotateByReaction({ ...reaction, reaction: '↩️', timestamp: 1002 }, store), true);
    assert.equal(store.item(item.id).display_rotation, 90);
    store.set('settings', { whatsappEnabled: true, groupId: 'other@g.us' });
    assert.equal(rotateByReaction({ ...reaction, timestamp: 1003 }, store), false);
    assert.deepEqual(await readFile(path.join(dir, 'originals', item.original_file)), buffer);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
