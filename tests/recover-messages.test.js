import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { recentImageIds } from '../server/recover-messages.js';
test('recovery selects recent ordinary photos and normalizes typed keys without duplicates', async () => {
  const photo = (id, t, extra = {}) => ({ id: { _serialized: id }, t, type: 'image', ...extra });
  const messages = [
    photo('old', 1),
    photo('one', 20),
    photo('one', 20),
    photo('private', 21, { isViewOnce: true }),
    photo('text', 22, { type: 'chat' }),
    photo(null, 23, {
      id: { fromMe: false, id: 'typed', participant: 'member', toString: () => '[object Object]' },
    }),
  ];
  let loads = 0;
  const client = {
    pupPage: {
      evaluate: async (fn, arg) =>
        vm.runInNewContext('(' + fn.toString() + ')(arg)', {
          arg,
          window: {
            WWebJS: {
              getChat: async (id) => {
                assert.equal(id, 'group');
                return { msgs: { getModelsArray: () => messages } };
              },
            },
            require: () => ({
              loadEarlierMsgs: async () => {
                loads++;
                return [];
              },
            }),
          },
        }),
    },
  };
  const ids = await recentImageIds(client, 'group', 10000);
  assert.deepEqual(Array.from(ids), ['one', 'false_group_typed_member']);
  assert.equal(loads, 1);
});
