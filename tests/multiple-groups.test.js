import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../server/store.js';
import { mediaService } from '../server/media.js';
import { importMessage, acknowledge } from '../server/import-message.js';
import { updateImageCaption } from '../server/edit-message.js';
import { deleteByReaction } from '../server/delete-reaction.js';
import { holdImage, approveByReaction } from '../server/image-review.js';
import { selectedGroupIds } from '../server/selected-groups.js';

test('multiple WhatsApp groups import, edit, approve and delete independently; deselection stops processing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wall-multigroup-'));
  const store = openStore(dir),
    media = mediaService(store, dir);
  try {
    assert.deepEqual(selectedGroupIds({ groupId: 'a@g.us' }), ['a@g.us']);
    assert.deepEqual(selectedGroupIds({ groupId: 'a@g.us', groupIds: [] }), []);
    store.set('settings', {
      ...store.settings(),
      whatsappEnabled: true,
      groupIds: ['a@g.us', 'b@g.us'],
    });
    const buffer = await sharp({
      create: { width: 20, height: 10, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    const reactions = [];
    const message = (group, id) => ({
      from: group,
      fromMe: false,
      hasMedia: true,
      type: 'image',
      id: { _serialized: id },
      body: 'Foto',
      downloadMedia: async () => ({ mimetype: 'image/jpeg', data: buffer.toString('base64') }),
      react: async (emoji) => reactions.push(emoji),
    });
    const a = message('a@g.us', 'a-photo'),
      b = message('b@g.us', 'b-photo');
    const pa = await importMessage(a, store, media),
      pb = await importMessage(b, store, media);
    assert.ok(pa && pb);
    assert.equal(await importMessage(message('c@g.us', 'c-photo'), store, media), null);
    await acknowledge(a, store);
    await acknowledge(b, store);
    assert.deepEqual(reactions, ['👍', '👍']);
    assert.equal(updateImageCaption(b, 'Neu', store), true);
    holdImage(store, pb.id, 'Unklar');
    assert.equal(approveByReaction({ msgId: 'b-photo', reaction: '✅' }, store), true);
    store.set('settings', { ...store.settings(), groupIds: ['a@g.us'] });
    assert.equal(updateImageCaption(b, 'Nicht mehr aktiv', store), false);
    assert.equal(await deleteByReaction({ msgId: 'b-photo', reaction: '❌' }, store, media), false);
    assert.equal(await importMessage(message('b@g.us', 'b-later'), store, media), null);
    assert.equal(await deleteByReaction({ msgId: 'a-photo', reaction: '❌' }, store, media), true);
    assert.equal(store.item(pa.id), undefined);
    assert.ok(store.item(pb.id));
    store.set('settings', { ...store.settings(), groupIds: [] });
    assert.equal(await importMessage(message('a@g.us', 'a-later'), store, media), null);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('per-group hashtag filter matches complete tags and checks caption before download', async () => {
  const { acceptsCaption } = await import('../server/selected-groups.js');
  const settings = {
    whatsappEnabled: true,
    groupIds: ['a', 'b'],
    groupRules: { a: { mode: 'hashtag', hashtag: '#Bilderwand' }, b: { mode: 'all' } },
  };
  assert.equal(acceptsCaption(settings, 'a', 'Hallo #bilderwand!'), true);
  assert.equal(acceptsCaption(settings, 'a', '#BILDERWAND'), true);
  for (const text of ['', '#bilderwandExtra', 'abc#bilderwand', '#bilderwand_test'])
    assert.equal(acceptsCaption(settings, 'a', text), false);
  assert.equal(acceptsCaption(settings, 'b', ''), true);
  let downloaded = false;
  const result = await importMessage(
    {
      from: 'a',
      type: 'image',
      hasMedia: true,
      body: 'Ohne Freigabe',
      downloadMedia: async () => {
        downloaded = true;
      },
    },
    { settings: () => settings },
    {},
  );
  assert.equal(result, null);
  assert.equal(downloaded, false);
});
