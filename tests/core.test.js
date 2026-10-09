import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../public/player-core.js';
import { defaults } from '../server/store.js';
import { validateSettings, validateItem } from '../server/validation.js';

test('pins rotate after N photos even when the photo library is short', () => {
  const scheduler = createScheduler();
  const items = [
    { id: 'a', pinned: false },
    { id: 'b', pinned: false },
    { id: 'x', pinned: true },
    { id: 'y', pinned: true, duration: 37 },
  ];
  const settings = { ...defaults, pinInterval: 3 };
  const slides = Array.from({ length: 12 }, () => scheduler.next(items, settings));
  assert.deepEqual(
    slides.map((item) => item.id),
    ['a', 'b', 'a', 'x', 'b', 'a', 'b', 'y', 'a', 'b', 'a', 'x'],
  );
  assert.equal(slides[0].seconds, 10);
  assert.equal(slides[3].seconds, 20);
  assert.equal(slides[7].seconds, 37);
});
test('empty, pins-only and removal during playback remain playable', () => {
  const scheduler = createScheduler();
  assert.equal(scheduler.next([], defaults), null);
  const pins = [
    { id: 'x', pinned: true },
    { id: 'y', pinned: true },
    { id: 'z', pinned: true, visible: false },
  ];
  assert.deepEqual(
    Array.from({ length: 4 }, () => scheduler.next(pins, defaults).id),
    ['x', 'y', 'x', 'y'],
  );
  assert.equal(scheduler.next([pins[0]], defaults).id, 'x');
  assert.equal(scheduler.next([{ id: 'new', pinned: false }], defaults).id, 'new');
});
test('invalid settings cannot break a player or override WhatsApp selection', () => {
  for (const input of [
    { photoDuration: 0 },
    { pinInterval: -1 },
    { transitionDuration: Infinity },
    { fit: 'bad' },
    { moderation: 'false' },
  ])
    assert.throws(() => validateSettings(input, defaults));
  assert.equal(
    validateSettings({ groupId: 'attacker', whatsappEnabled: true }, defaults).groupId,
    '',
  );
  assert.throws(() => validateItem({ title: '', duration: 0 }));
  assert.equal(validateItem({ title: 'Hello', duration: null }).duration, null);
});

test('multi-photo pages avoid duplicates and preserve pinned content cadence', async () => {
  const { createPageScheduler } = await import('../public/player-core.js');
  const scheduler = createPageScheduler();
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, type: 'image', pinned: false }));
  items.push({ id: 'pin', type: 'text', pinned: true });
  const settings = { ...defaults, photosPerScreen: 4, pinInterval: 5 };
  assert.deepEqual(
    scheduler.next(items, settings).map((x) => x.id),
    ['a', 'b', 'c', 'd'],
  );
  assert.deepEqual(
    scheduler.next(items, settings).map((x) => x.id),
    ['e'],
  );
  assert.deepEqual(
    scheduler.next(items, settings).map((x) => x.id),
    ['pin'],
  );
  assert.deepEqual(
    scheduler.next(items, settings).map((x) => x.id),
    ['f', 'a', 'b', 'c'],
  );
  const short = createPageScheduler();
  assert.deepEqual(
    short.next(items.slice(0, 2), settings).map((x) => x.id),
    ['a', 'b'],
  );
  assert.deepEqual(short.next([], settings), []);
});

test('adaptive layout pairs portraits and preserves landscape and pinned slides', async () => {
  const { createAdaptiveScheduler } = await import('../public/player-core.js');
  const scheduler = createAdaptiveScheduler(async (url) => ({
    naturalWidth: url === 'wide' ? 1600 : 900,
    naturalHeight: 1200,
  }));
  const items = ['a', 'b', 'wide', 'c'].map((id) => ({
    id,
    url: id,
    type: 'image',
    pinned: false,
  }));
  const settings = { ...defaults, photosPerScreen: 4, pinInterval: 100 };
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['wide'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['c', 'b'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['c', 'a'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['wide'],
  );
  const pinned = createAdaptiveScheduler(async () => ({ naturalWidth: 900, naturalHeight: 1600 }));
  assert.equal((await pinned.next([{ ...items[0], pinned: true }], settings)).length, 1);
  assert.equal((await pinned.next(items, { ...settings, photosPerScreen: 1 })).length, 1);
});

test('portrait pin stays while only the other half rotates', async () => {
  const { createAdaptiveScheduler } = await import('../public/player-core.js');
  const scheduler = createAdaptiveScheduler(async () => ({
    naturalWidth: 900,
    naturalHeight: 1600,
  }));
  const items = ['a', 'b', 'c', 'pin'].map((id) => ({
    id,
    url: id,
    type: 'image',
    pinned: id === 'pin',
  }));
  const settings = { ...defaults, pinInterval: 2, photosPerScreen: 2 };
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['pin', 'b'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['pin', 'c'],
  );
  assert.deepEqual(
    (await scheduler.next(items, settings)).map((x) => x.item.id),
    ['pin', 'a'],
  );
  const result = await scheduler.next(
    items.filter((x) => x.id !== 'pin'),
    settings,
  );
  assert.ok(result.every((x) => x.item.id !== 'pin'));
});

test('split timing halves the interval only when both sides rotate', async () => {
  const { pageDelay } = await import('../public/player-core.js');
  const photo = { item: { seconds: 10, pinned: false } };
  const pin = { item: { seconds: 20, pinned: true } };
  assert.equal(pageDelay([photo, photo], photo), 5000);
  assert.equal(pageDelay([photo], photo), 10000);
  assert.equal(pageDelay([pin, photo], pin), 10000);
  assert.equal(pageDelay([pin], pin), 20000);
});

test('fourth field reverts to photos and a dedicated field always carries pins', async () => {
  const { zoneItems } = await import('../public/player-core.js');
  const photos = ['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'image', pinned: false }));
  assert.deepEqual(
    zoneItems(photos, 3, false).map((x) => x.id),
    ['d'],
  );
  assert.deepEqual(zoneItems(photos, 3, true), []);
  const items = [...photos, { id: 'pin', type: 'image', pinned: true }];
  assert.deepEqual(
    zoneItems(items, 0, false).map((x) => x.id),
    ['pin'],
  );
  assert.deepEqual(
    zoneItems(items, 0, true).map((x) => x.id),
    ['pin'],
  );
  for (const hasNotice of [false, true]) {
    const all = [0, 1, 2, 3].flatMap((zone) => zoneItems(items, zone, hasNotice));
    assert.equal(new Set(all.map((x) => x.id)).size, items.length);
    assert.equal(all.length, items.length);
  }
});

test('sender labels omit telephone numbers and WhatsApp identifiers', async () => {
  const { senderName } = await import('../server/sender-name.js');
  for (const value of ['+43 660 1234567', '0043 (660) 123-456', '123456@lid', '123@c.us', null])
    assert.equal(senderName(value), '');
  assert.equal(senderName('  Maker Mike  '), 'Maker Mike');
});

test('shuffle visits each photo once per round and avoids immediate repeat across rounds', () => {
  const scheduler = createScheduler();
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, pinned: false }));
  const settings = { ...defaults, shuffle: true };
  let previous;
  for (let round = 0; round < 20; round++) {
    const ids = items.map(() => scheduler.next(items, settings).id);
    assert.equal(new Set(ids).size, 4);
    assert.notEqual(ids[0], previous);
    previous = ids.at(-1);
  }
  assert.equal(scheduler.next([items[0]], settings).id, 'a');
  assert.equal(scheduler.next([], settings), null);
});
