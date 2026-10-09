import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGroups } from '../server/groups.js';

test('group picker needs neither participant serialization nor last messages', async () => {
  const chats = [
    { id: { _serialized: 'private@c.us' }, name: 'Private' },
    {
      id: { _serialized: 'b@g.us' },
      formattedTitle: 'Werkstatt',
      serialize() {
        throw new Error('broken serializer');
      },
    },
    { id: { _serialized: 'a@g.us' }, groupMetadata: { subject: 'Example Town' } },
    { id: { _serialized: 'b@g.us' }, name: 'Werkstatt' },
    { id: { _serialized: 'news@newsletter' } },
  ];
  const client = {
    pupPage: {
      evaluate: async (fn) =>
        vm.runInNewContext(`(${fn.toString()})()`, {
          window: {
            require: (name) => {
              assert.equal(name, 'WAWebCollections');
              return { Chat: { getModelsArray: () => chats } };
            },
          },
        }),
    },
  };
  assert.equal(
    JSON.stringify(await loadGroups(client)),
    JSON.stringify([
      { id: 'a@g.us', name: 'Example Town' },
      { id: 'b@g.us', name: 'Werkstatt' },
    ]),
  );
});
