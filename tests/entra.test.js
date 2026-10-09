import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { openStore } from '../server/store.js';
import { entraService } from '../server/entra.js';
import { createApp } from '../server/app.js';
const tenant = '11111111-1111-4111-8111-111111111111',
  client = '22222222-2222-4222-8222-222222222222',
  oid = '33333333-3333-4333-8333-333333333333';
const configuration = {
  enabled: true,
  tenantId: tenant,
  clientId: client,
  origin: 'http://localhost:3000',
  clientSecret: 'test-client-secret',
  users: [{ oid, label: 'Test user' }],
};
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wall-entra-'));
  const store = openStore(dir);
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey);
  key.kid = 'test-key';
  let nonce,
    patch = {},
    signingKey = privateKey,
    exchange = 0,
    requestBody;
  const request = async (url, options) => {
    if (url.includes('.well-known'))
      return Response.json({ issuer: `https://login.microsoftonline.com/${tenant}/v2.0` });
    exchange++;
    requestBody = options.body;
    const claims = {
      tid: tenant,
      oid,
      sub: 'test-subject',
      nonce,
      ver: '2.0',
      name: 'Test User',
      ...patch,
    };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(patch.iss || `https://login.microsoftonline.com/${tenant}/v2.0`)
      .setAudience(patch.aud || client)
      .setIssuedAt()
      .setExpirationTime(patch.exp || '5m')
      .sign(signingKey);
    return Response.json({ id_token: token });
  };
  const jwks = createLocalJWKSet({ keys: [key] });
  const service = entraService(store, dir, { request, jwks });
  service.save(configuration);
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    store,
    service,
    request,
    jwks,
    setPatch(value) {
      patch = value;
    },
    setKey(value) {
      signingKey = value;
    },
    get exchange() {
      return exchange;
    },
    get requestBody() {
      return requestBody;
    },
    start() {
      const flow = service.start();
      const url = new URL(flow.url);
      nonce = url.searchParams.get('nonce');
      return { ...flow, state: url.searchParams.get('state'), url };
    },
  };
}
test('Entra validates signed identity, PKCE, encrypted settings and single-use callback', async (t) => {
  const f = await fixture(t),
    flow = f.start();
  assert.equal(flow.url.searchParams.get('scope'), 'openid profile');
  assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(f.service.settings().secretSet, true);
  assert.equal(JSON.stringify(f.service.settings()).includes('test-client-secret'), false);
  assert.equal(f.store.get('entra').secretCipher.includes('test-client-secret'), false);
  assert.equal((await readFile(path.join(f.dir, 'entra-secrets.key'))).length, 32);
  const user = await f.service.finish({
    state: flow.state,
    binding: flow.binding,
    code: 'valid-code',
  });
  assert.equal(user.subject, oid);
  assert.equal(
    createHash('sha256').update(f.requestBody.get('code_verifier')).digest('base64url'),
    flow.url.searchParams.get('code_challenge'),
  );
  await assert.rejects(() =>
    f.service.finish({ state: flow.state, binding: flow.binding, code: 'valid-code' }),
  );
  assert.equal(f.exchange, 1);
  assert.equal((await f.service.check()).ok, true);
});
test('Entra rejects wrong nonce, foreign tenant, unauthorized user, bad signature and browser binding', async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { nonce: 'wrong' },
    { aud: 'wrong-client' },
    { iss: 'https://other.example' },
    { exp: 1 },
    { tid: '44444444-4444-4444-8444-444444444444' },
    { oid: '44444444-4444-4444-8444-444444444444' },
  ]) {
    f.setPatch(patch);
    const flow = f.start();
    await assert.rejects(() =>
      f.service.finish({ state: flow.state, binding: flow.binding, code: 'test' }),
    );
  }
  f.setPatch({});
  const flow = f.start();
  const before = f.exchange;
  await assert.rejects(() =>
    f.service.finish({ state: flow.state, binding: 'other-browser', code: 'test' }),
  );
  assert.equal(f.exchange, before);
  f.setKey((await generateKeyPair('RS256')).privateKey);
  await assert.rejects(() =>
    f.service.finish({ state: flow.state, binding: flow.binding, code: 'test' }),
  );
});
test('Entra expires flows and invalidates them on configuration changes; HTTPS and allowlist required', async (t) => {
  const f = await fixture(t),
    expired = f.start();
  f.store.db.prepare('UPDATE entra_flows SET expires=0').run();
  await assert.rejects(() =>
    f.service.finish({ state: expired.state, binding: expired.binding, code: 'test' }),
  );
  const old = f.start();
  f.service.save({ ...configuration, clientSecret: '' });
  await assert.rejects(() =>
    f.service.finish({ state: old.state, binding: old.binding, code: 'test' }),
  );
  for (const bad of [
    { users: [] },
    { origin: 'http://remote.example' },
    { tenantId: 'common' },
    { origin: 'https://wall.example' },
  ])
    assert.throws(() => f.service.save({ ...configuration, ...bad }));
  f.service.save({ ...configuration, enabled: false, clientSecret: '' });
  assert.throws(() => f.service.start());
});
test('Entra HTTP callback issues individual admin session; master-only settings, revocation and local login remain', async (t) => {
  const f = await fixture(t);
  const dir = await mkdtemp(path.join(tmpdir(), 'wall-entra-api-'));
  const app = createApp({ dataDir: dir, entraRequest: f.request, entraJwks: f.jwks });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, cookie, method = 'GET', body) =>
    fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { ...(cookie ? { cookie } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const setup = await request('/api/setup', null, 'POST', { password: 'test-master-password' });
  const master = setup.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await request('/api/entra')).status, 401);
  assert.equal((await request('/api/entra/users')).status, 403);
  assert.equal((await request('/api/entra', master, 'PUT', configuration)).status, 200);
  const start = await request('/api/auth/entra/start');
  const location = new URL(start.headers.get('location'));
  const binding = start.headers.getSetCookie()[0].split(';')[0];
  assert.match(start.headers.getSetCookie()[0], /HttpOnly/);
  assert.match(start.headers.getSetCookie()[0], /SameSite=Lax/);
  // The mock issuer signs the nonce chosen by the HTTP flow.
  f.setPatch({ nonce: location.searchParams.get('nonce') });
  const callback = '/api/auth/entra/callback?code=test&state=' + location.searchParams.get('state');
  const done = await request(callback, binding);
  assert.equal(done.headers.get('location'), '/');
  const cookies = done.headers.getSetCookie();
  const entraCookie = cookies.findLast((c) => c.startsWith('wall_admin=')).split(';')[0];
  const session = await (await request('/api/session', entraCookie)).json();
  assert.equal(session.user.provider, 'entra');
  assert.equal(session.user.subject, oid);
  assert.equal((await request('/api/admin/state', entraCookie)).status, 200);
  assert.equal((await request('/api/entra/users', entraCookie)).status, 403);
  assert.equal((await request('/api/entra', entraCookie, 'PUT', configuration)).status, 403);
  assert.equal(
    (
      await request('/api/password', entraCookie, 'POST', {
        oldPassword: 'test-master-password',
        password: 'new-test-password',
      })
    ).status,
    403,
  );
  assert.equal((await request(callback, binding)).headers.get('location'), '/?login=entra-failed');
  const saved = await request('/api/entra', master, 'PUT', {
    ...configuration,
    enabled: false,
    clientSecret: '',
  });
  assert.equal(saved.status, 200);
  assert.equal((await request('/api/admin/state', entraCookie)).status, 401);
  assert.equal((await request('/api/admin/state', master)).status, 200);
  assert.equal(
    (await request('/api/login', null, 'POST', { password: 'test-master-password' })).status,
    200,
  );
});
