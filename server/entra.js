import { entraDirectory } from './entra-directory.js';
import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { assert } from './validation.js';
import { digest, equal } from './auth.js';
import { entraSecrets } from './entra-secrets.js';
import {
  emptyEntra,
  entraCallbackPath,
  publicEntra,
  validateEntra,
  guid,
} from './entra-settings.js';
const random = () => randomBytes(32).toString('base64url');
const microsoft = 'https://login.microsoftonline.com';

export function entraService(store, dataDir, options = {}) {
  const get = () => ({ ...emptyEntra, ...store.get('entra') });
  const secrets = entraSecrets(dataDir, Boolean(get().secretCipher));
  const request = options.request || fetch;
  const keys = new Map();
  store.db.exec(`CREATE TABLE IF NOT EXISTS entra_flows (
    state TEXT PRIMARY KEY, binding TEXT NOT NULL, nonce TEXT NOT NULL,
    verifier TEXT NOT NULL, expires INTEGER NOT NULL, revision TEXT NOT NULL
  )`);
  async function verify(token, config, nonce) {
    if (!keys.has(config.tenantId))
      keys.set(
        config.tenantId,
        createRemoteJWKSet(new URL(`${microsoft}/${config.tenantId}/discovery/v2.0/keys`), {
          timeoutDuration: 10000,
        }),
      );
    const { payload } = await jwtVerify(token, options.jwks || keys.get(config.tenantId), {
      issuer: `${microsoft}/${config.tenantId}/v2.0`,
      audience: config.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'tid', 'oid', 'nonce'],
      clockTolerance: 5,
      maxTokenAge: '10m',
    });
    assert(
      payload.aud === config.clientId && (!payload.azp || payload.azp === config.clientId),
      'Ungültiger Client.',
      403,
    );
    assert(payload.tid === config.tenantId && payload.ver === '2.0', 'Ungültiger Mandant.', 403);
    assert(
      typeof payload.nonce === 'string' && equal(payload.nonce, nonce),
      'Ungültige Anmeldung.',
      403,
    );
    assert(typeof payload.oid === 'string' && guid.test(payload.oid), 'Ungültiger Benutzer.', 403);
    const oid = payload.oid.toLowerCase();
    assert(
      config.users.some((user) => user.oid === oid),
      'Benutzer nicht freigegeben.',
      403,
    );
    return {
      subject: oid,
      name: typeof payload.name === 'string' ? payload.name.slice(0, 120) : 'Microsoft-Benutzer',
      revision: config.revision,
    };
  }
  return {
    searchUsers: entraDirectory(get, secrets, request),
    enabled: () => get().enabled,
    settings: () => publicEntra(get()),
    save(input) {
      const value = validateEntra(input, get(), secrets, options);
      store.db.exec('BEGIN');
      try {
        store.set('entra', value);
        store.db.prepare("DELETE FROM sessions WHERE role='entra'").run();
        store.db.prepare('DELETE FROM entra_flows').run();
        store.db.exec('COMMIT');
      } catch (error) {
        store.db.exec('ROLLBACK');
        throw error;
      }
      return publicEntra(value);
    },
    async check() {
      const config = get();
      assert(
        config.tenantId && config.clientId && config.origin && config.secretCipher,
        'Konfiguration zuerst vervollständigen und speichern.',
      );
      const response = await request(
        `${microsoft}/${config.tenantId}/v2.0/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(10000), redirect: 'error' },
      );
      assert(response.ok, 'Microsoft-Konfiguration nicht erreichbar.');
      const metadata = await response.json();
      assert(
        metadata.issuer === `${microsoft}/${config.tenantId}/v2.0`,
        'Microsoft liefert einen anderen Mandanten.',
      );
      return {
        ok: true,
        message:
          'Mandant erreichbar. Client-Geheimnis und Benutzerfreigabe werden erst bei einer echten Anmeldung geprüft.',
      };
    },
    start() {
      const config = get();
      assert(config.enabled, 'Microsoft-Anmeldung ist nicht aktiviert.', 403);
      store.db.prepare('DELETE FROM entra_flows WHERE expires<?').run(Date.now());
      assert(
        store.db.prepare('SELECT count(*) AS count FROM entra_flows').get().count < 1000,
        'Zu viele laufende Anmeldungen.',
        429,
      );
      const state = random(),
        binding = random(),
        nonce = random(),
        verifier = random();
      store.db
        .prepare('INSERT INTO entra_flows VALUES (?,?,?,?,?,?)')
        .run(digest(state), digest(binding), nonce, verifier, Date.now() + 600000, config.revision);
      const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: config.origin + entraCallbackPath,
        response_mode: 'query',
        scope: 'openid profile',
        state,
        nonce,
        prompt: 'select_account',
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      });
      return { binding, url: `${microsoft}/${config.tenantId}/oauth2/v2.0/authorize?${params}` };
    },
    async finish({ state, code, binding }) {
      assert(
        typeof state === 'string' &&
          typeof code === 'string' &&
          typeof binding === 'string' &&
          code.length < 8192,
        'Ungültige Anmeldung.',
        403,
      );
      const flow = store.db.prepare('SELECT * FROM entra_flows WHERE state=?').get(digest(state));
      assert(
        flow && flow.expires > Date.now() && equal(flow.binding, digest(binding)),
        'Anmeldung abgelaufen oder ungültig.',
        403,
      );
      // Consume before contacting Microsoft: callbacks are strictly one-use.
      store.db.prepare('DELETE FROM entra_flows WHERE state=?').run(digest(state));
      const config = get();
      assert(
        config.enabled && flow.revision === config.revision,
        'Anmeldung bitte neu starten.',
        403,
      );
      const response = await request(`${microsoft}/${config.tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: secrets.decrypt(config.secretCipher),
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.origin + entraCallbackPath,
          code_verifier: flow.verifier,
          scope: 'openid profile',
        }),
      });
      assert(response.ok, 'Microsoft-Anmeldung fehlgeschlagen.', 403);
      const tokens = await response.json();
      assert(typeof tokens.id_token === 'string', 'Kein ID-Token erhalten.', 403);
      const identity = await verify(tokens.id_token, config, flow.nonce);
      assert(
        get().enabled && get().revision === config.revision,
        'Konfiguration wurde geändert.',
        403,
      );
      return identity;
    },
  };
}
