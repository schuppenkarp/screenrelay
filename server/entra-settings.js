import { randomUUID } from 'node:crypto';
import { assert, text } from './validation.js';
export const entraCallbackPath = '/api/auth/entra/callback';
export const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const emptyEntra = {
  enabled: false,
  tenantId: '',
  clientId: '',
  origin: '',
  users: [],
  secretCipher: '',
  revision: '',
};
export function publicEntra(value) {
  const { secretCipher, revision, ...safe } = value;
  return {
    ...safe,
    secretSet: Boolean(secretCipher),
    callbackUrl: value.origin ? value.origin + entraCallbackPath : '',
  };
}
export function validateEntra(input, previous, secrets, { publicOrigin, secure }) {
  const value = { ...emptyEntra, enabled: input.enabled === true };
  for (const key of ['tenantId', 'clientId']) {
    value[key] = text(input[key], 100, key).trim().toLowerCase();
    assert(!value[key] || guid.test(value[key]), `${key}: Bitte eine gültige UUID eingeben.`);
  }
  value.origin = text(input.origin, 2048, 'App-Adresse').trim();
  if (value.origin) {
    let url;
    try {
      url = new URL(value.origin);
    } catch {
      assert(false, 'Ungültige App-Adresse.');
    }
    assert(
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
      'App-Adresse ohne Pfad, Zugangsdaten oder Parameter eingeben.',
    );
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    assert(
      url.protocol === 'https:' || (url.protocol === 'http:' && local),
      'HTTPS verwenden; HTTP ist nur für localhost erlaubt.',
    );
    assert(
      url.protocol !== 'https:' || secure,
      'Für HTTPS zuerst COOKIE_SECURE=true am Server setzen.',
    );
    value.origin = url.origin;
    assert(
      !publicOrigin || value.origin === new URL(publicOrigin).origin,
      'App-Adresse muss PUBLIC_ORIGIN entsprechen.',
    );
  }
  assert(
    Array.isArray(input.users) && input.users.length <= 200,
    'Maximal 200 Benutzer eintragen.',
  );
  const ids = new Set();
  value.users = input.users.map((user) => {
    const oid = text(user.oid, 100, 'Benutzer-Objekt-ID', true).trim().toLowerCase();
    assert(
      guid.test(oid) && !ids.has(oid),
      'Benutzer-Objekt-IDs müssen gültig und eindeutig sein.',
    );
    ids.add(oid);
    return {
      oid,
      label: text(user.label, 120, 'Anzeigename').trim(),
      email: text(user.email || '', 254, 'E-Mail').trim(),
    };
  });
  const secret = text(input.clientSecret, 4096, 'Client-Geheimnis');
  value.secretCipher = input.clearSecret ? '' : previous.secretCipher;
  if (secret) value.secretCipher = secrets.encrypt(secret);
  if (value.enabled)
    assert(
      value.tenantId && value.clientId && value.origin && value.secretCipher && value.users.length,
      'Zum Aktivieren Mandant, Client, App-Adresse, Geheimnis und mindestens einen Benutzer eintragen.',
    );
  value.revision = randomUUID();
  return value;
}
