import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hasPinHashtag } from '../server/pin-hashtag.js';
import { displayCaption } from '../server/display-caption.js';
import { groupRule } from '../server/selected-groups.js';
import { openStore } from '../server/store.js';
import { mediaService } from '../server/media.js';
import { importMessage } from '../server/import-message.js';
import { deleteByReaction } from '../server/delete-reaction.js';

const rule = { mode: 'hashtag', hashtag: '#bot', allowPin: true, captionMode: 'removeHashtag' };
test('pin command uses exact adjacent case-insensitive tags and respects explicit permission', () => {
  assert.equal(hasPinHashtag('Info #BOT#FIX', rule), true);
  for (const caption of [
    '#bot',
    '#fix',
    '#bot #fix',
    '#bot#fixed',
    'a#bot#fix',
    '#other#fix',
    '#bot#fix#more',
  ])
    assert.equal(hasPinHashtag(caption, rule), false);
  assert.equal(hasPinHashtag('#bot#fix', { ...rule, allowPin: false }), false);
  assert.equal(displayCaption({ body: 'Info #BOT#FIX heute' }, rule).body, 'Info heute');
  assert.equal(
    displayCaption({ body: '#bot#fix' }, { ...rule, captionMode: 'full' }).body,
    '#bot#fix',
  );
  const settings = {
    groupIds: ['one'],
    groupRules: { one: { ...rule, allowPin: false } },
    knownGroups: [{ id: 'one', name: 'Team' }],
    groupPatterns: [{ ...rule, pattern: '*' }],
  };
  assert.equal(hasPinHashtag('#bot#fix', groupRule(settings, 'one')), false);
});

test('double tag creates a pinned WhatsApp image, red cross archives it without replay', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wall-pin-tag-'));
  const store = openStore(dir),
    media = mediaService(store, dir);
  try {
    store.set('settings', {
      whatsappEnabled: true,
      groupId: 'group@g.us',
      groupRules: { 'group@g.us': rule },
    });
    const image = await sharp({ create: { width: 5, height: 4, channels: 3, background: 'red' } })
      .jpeg()
      .toBuffer();
    const message = {
      from: 'group@g.us',
      fromMe: false,
      hasMedia: true,
      type: 'image',
      id: { _serialized: 'false_group@g.us_photo' },
      body: 'Notice #bot#fix',
      downloadMedia: async () => ({ mimetype: 'image/jpeg', data: image.toString('base64') }),
    };
    const item = await importMessage(message, store, media);
    assert.equal(item.pinned, true);
    assert.equal(item.body, message.body);
    assert.equal(await deleteByReaction({ reaction: '❌', msgId: message.id }, store, media), true);
    assert.equal(store.item(item.id), undefined);
    assert.equal(await importMessage(message, store, media), null);
    store.set('settings', {
      ...store.settings(),
      groupRules: { 'group@g.us': { ...rule, allowPin: false } },
    });
    const ordinary = await importMessage(
      { ...message, id: { _serialized: 'false_group@g.us_second' } },
      store,
      media,
    );
    assert.equal(ordinary.pinned, false);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
