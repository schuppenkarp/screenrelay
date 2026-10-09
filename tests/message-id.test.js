import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessageId } from '../server/message-id.js';

test('restores the serialized ID needed by SQLite, downloadMedia and reactions', () => {
  const message = {
    id: { fromMe: false, remote: '123@g.us', id: 'ABC', participant: '456@c.us' },
    fromMe: false,
  };
  assert.equal(normalizeMessageId(message), 'false_123@g.us_ABC_456@c.us');
  assert.equal(message.id._serialized, 'false_123@g.us_ABC_456@c.us');
  assert.equal(normalizeMessageId(message), 'false_123@g.us_ABC_456@c.us');
  assert.equal(
    normalizeMessageId({
      id: { fromMe: true, remote: { user: '123', server: 'g.us' }, id: 'XYZ' },
    }),
    'true_123@g.us_XYZ',
  );
  assert.throws(() => normalizeMessageId({ id: {} }), /Nachrichten-ID/);
});
