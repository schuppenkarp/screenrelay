import test from 'node:test';
import assert from 'node:assert/strict';
import { entraDirectory } from '../server/entra-directory.js';
const oid = '33333333-3333-4333-8333-333333333333';
function fixture() {
  let config = {
    tenantId: 'tenant',
    clientId: 'client',
    secretCipher: 'encrypted',
    revision: 'one',
  };
  const calls = [];
  let graphStatus = 200;
  const search = entraDirectory(
    () => config,
    { decrypt: () => 'test-secret' },
    async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/token'))
        return Response.json({ access_token: 'test-graph-token', expires_in: 3600 });
      if (graphStatus !== 200) return new Response('', { status: graphStatus });
      return Response.json({
        value: [
          {
            id: oid,
            displayName: 'Test Person',
            mail: 'person@example.test',
            department: 'not returned',
          },
          { id: 'invalid', displayName: 'Bad' },
        ],
        '@odata.nextLink': 'https://untrusted.example/not-followed',
      });
    },
  );
  return {
    search,
    calls,
    setConfig(value) {
      config = { ...config, ...value };
    },
    setStatus(value) {
      graphStatus = value;
    },
  };
}
test('directory suggestions expose only names and identifiers, escape filters, limit results and cache tokens', async () => {
  const f = fixture();
  const result = await f.search("O'Neil");
  assert.deepEqual(result, {
    users: [{ oid, label: 'Test Person', email: 'person@example.test' }],
    more: true,
  });
  const token = f.calls[0];
  assert.equal(token.options.body.get('grant_type'), 'client_credentials');
  assert.equal(token.options.body.get('scope'), 'https://graph.microsoft.com/.default');
  const query = new URL(f.calls[1].url).searchParams;
  assert.equal(query.get('$top'), '25');
  assert.match(query.get('$filter'), /O''Neil/);
  assert.match(query.get('$filter'), /accountEnabled eq true/);
  assert.equal(f.calls[1].options.headers.Authorization, 'Bearer test-graph-token');
  await f.search('');
  assert.equal(f.calls.filter((call) => call.url.includes('/token')).length, 1);
  f.setConfig({ revision: 'two' });
  await f.search('Test');
  assert.equal(f.calls.filter((call) => call.url.includes('/token')).length, 2);
  assert.equal(JSON.stringify(result).includes('test-graph-token'), false);
});
test('directory lookup reports missing configuration, permission and throttling without leaking upstream responses', async () => {
  const f = fixture();
  f.setConfig({ secretCipher: '' });
  await assert.rejects(() => f.search(''), /zuerst speichern/);
  assert.equal(f.calls.length, 0);
  f.setConfig({ secretCipher: 'encrypted' });
  f.setStatus(403);
  await assert.rejects(() => f.search(''), /User.Read.All/);
  f.setStatus(429);
  await assert.rejects(() => f.search(''), /kurz warten/);
  await assert.rejects(() => f.search('a'.repeat(101)), /Suchbegriff/);
});
