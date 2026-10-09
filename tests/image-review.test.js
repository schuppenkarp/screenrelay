import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../server/store.js';
import { holdImage, notifyHeld, approveByReaction } from '../server/image-review.js';
test('held photo gets one question and reply, only selected-group checkmark releases it', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wall-review-'));
  const store = openStore(dir);
  try {
    store.set('settings', { ...store.settings(), whatsappEnabled: true, groupId: 'group@g.us' });
    store.db
      .prepare(
        "INSERT INTO items (id,type,title,source,message_id,created) VALUES ('photo','image','Test','whatsapp','message',1)",
      )
      .run();
    store.db.prepare("INSERT INTO receipts VALUES ('message','group@g.us',0)").run();
    holdImage(store, 'photo', 'Unklar');
    assert.equal(store.item('photo').visible, false);
    const sent = [];
    const message = {
      id: 'message',
      react: async (x) => sent.push(x),
      reply: async (x) => sent.push(x),
    };
    await notifyHeld(message, store);
    await notifyHeld(message, store);
    assert.deepEqual(sent, ['❓', 'KI Inhaltserkennung hat ihr Bild temporär gesperrt']);
    assert.equal(approveByReaction({ msgId: 'message', reaction: '👍' }, store), false);
    store.set('settings', { ...store.settings(), groupId: 'other@g.us' });
    assert.equal(approveByReaction({ msgId: 'message', reaction: '✅' }, store), false);
    store.set('settings', { ...store.settings(), groupId: 'group@g.us' });
    assert.equal(approveByReaction({ msgId: 'message', reaction: '✅' }, store), true);
    assert.equal(store.item('photo').visible, true);
    assert.equal(approveByReaction({ msgId: 'message', reaction: '✅' }, store), false);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
