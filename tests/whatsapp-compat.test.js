import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installMessageCompatibility } from '../server/whatsapp-compat.js';

test('typed key adapter fixes both media and reaction lookup without altering native lookups', async () => {
  const typedKey = { value: 'false_group@g.us_IMG' },
    record = { image: true };
  const Msg = {
    get(key) {
      if (typeof key === 'string') throw new Error('typed key required');
      return key === typedKey ? record : undefined;
    },
  };
  const WWebJS = { getMessageModel: () => ({ id: { id: 'IMG' } }) };
  const context = {
    window: {
      WWebJS,
      require: (name) =>
        name === 'WAWebCollections'
          ? { Msg }
          : {
              fromString: (value) => {
                assert.equal(value, typedKey.value);
                return typedKey;
              },
            },
    },
  };
  const client = {
    pupPage: { evaluate: async (fn) => vm.runInNewContext(`(${fn.toString()})()`, context) },
  };
  await installMessageCompatibility(client);
  await installMessageCompatibility(client);
  assert.equal(Msg.get(typedKey.value), record);
  assert.equal(Msg.get(typedKey), record);
  assert.equal(
    WWebJS.getMessageModel({ id: { toString: () => typedKey.value } }).id._serialized,
    typedKey.value,
  );
});
