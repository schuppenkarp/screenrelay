import test from 'node:test';
import assert from 'node:assert/strict';
import { reolinkSessions } from '../server/reolink.js';
import { validateStream } from '../server/streams.js';

test('Reolink caches concurrent logins and keeps credentials out of playback URLs', async () => {
  let calls = 0;
  const sessions = reolinkSessions(async (url, options) => {
    calls++;
    assert.equal(String(url), 'http://camera.local/cgi-bin/api.cgi?cmd=Login');
    assert.equal(JSON.parse(options.body)[0].param.User.password, 'test#$');
    assert.equal(options.redirect, 'error');
    return Response.json([
      { code: 0, value: { Token: { name: 'private-session', leaseTime: 3600 } } },
    ]);
  });
  const item = {
    id: 'camera',
    ...validateStream({
      title: 'Camera',
      stream_kind: 'reolink',
      stream_url:
        'http://admin:test%23%24@camera.local/flv?port=1935&app=bcs&stream=channel4_sub.bcs',
    }),
  };
  const sources = await Promise.all([sessions.source(item), sessions.source(item)]);
  assert.equal(calls, 1);
  assert.equal(sources[0].username, '');
  assert.equal(sources[0].password, '');
  assert.equal(sources[0].searchParams.get('token'), 'private-session');
  assert.equal(sources[0].searchParams.get('stream'), 'channel4_sub.bcs');
  sessions.clear();
  await sessions.source(item);
  assert.equal(calls, 2);
});

test('Reolink rejected logins are not cached and invalid camera configuration is rejected', async () => {
  let calls = 0;
  const sessions = reolinkSessions(async () => {
    calls++;
    return Response.json([{ code: 1, error: { detail: 'private camera error' } }]);
  });
  const item = { id: 'camera', stream_url: 'http://admin:test@camera.local/flv' };
  for (let attempt = 0; attempt < 2; attempt++)
    await assert.rejects(sessions.source(item), /Reolink-Anmeldung abgelehnt/);
  assert.equal(calls, 2);
  assert.throws(() =>
    validateStream({
      title: 'Camera',
      stream_kind: 'reolink',
      stream_url: 'http://camera.local/?ch=4',
    }),
  );
});
