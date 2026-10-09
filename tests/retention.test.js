import test from 'node:test';
import assert from 'node:assert/strict';
import { displayItems } from '../server/retention.js';
import { validateSettings } from '../server/validation.js';
import { defaults } from '../server/store.js';

test('expiry keeps newest minimum, excludes hidden photos and preserves pins and uploads', () => {
  const day = 86400000,
    now = 100 * day;
  const photo = (id, age, extra = {}) => ({
    id,
    created: now - age * day,
    visible: true,
    type: 'image',
    source: 'whatsapp',
    pinned: false,
    ...extra,
  });
  const items = [
    photo('old', 50),
    photo('keep', 40),
    photo('new', 1),
    photo('hidden', 0, { visible: false }),
    photo('pin', 60, { pinned: true }),
    photo('upload', 60, { source: 'admin' }),
  ];
  const settings = { retentionDays: 30, minimumPhotos: 2 };
  assert.deepEqual(
    displayItems(items, settings, now).map((x) => x.id),
    ['keep', 'new', 'pin', 'upload'],
  );
  assert.equal(displayItems(items, { ...settings, minimumPhotos: 10 }, now).length, 5);
  assert.equal(displayItems(items, { ...settings, retentionDays: 0 }, now).length, 5);
  assert.deepEqual(
    displayItems([photo('boundary', 30)], { ...settings, minimumPhotos: 0 }, now),
    [],
  );
  assert.equal(displayItems(items, settings, now + 100 * day).length, 4);
});

test('retention settings validate and reject invalid limits', () => {
  for (const input of [
    { retentionDays: -1 },
    { retentionDays: 1.5 },
    { minimumPhotos: -1 },
    { minimumPhotos: '10' },
  ])
    assert.throws(() => validateSettings(input, defaults));
  assert.equal(validateSettings({ retentionDays: 0, minimumPhotos: 0 }, defaults).retentionDays, 0);
});

test('maximum caps newest photos even without age expiry, with pins exempt', () => {
  const items = [1, 2, 3, 4].map((n) => ({
    id: String(n),
    created: n,
    visible: true,
    pinned: false,
    type: 'image',
    source: n === 4 ? 'upload' : 'whatsapp',
  }));
  items.push({ ...items[0], id: 'pin', pinned: true });
  assert.deepEqual(
    displayItems(items, { retentionDays: 0, minimumPhotos: 10, maximumPhotos: 2 }).map((x) => x.id),
    ['3', '4', 'pin'],
  );
  assert.equal(displayItems(items, { retentionDays: 0, maximumPhotos: 0 }).length, 5);
  assert.throws(() => validateSettings({ maximumPhotos: -1 }, defaults));
});
