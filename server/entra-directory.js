import { assert, text } from './validation.js';
import { guid } from './entra-settings.js';

/** Server-side directory lookup. Graph tokens never leave this service. */
export function entraDirectory(getConfig, secrets, request = fetch) {
  let cached;
  async function accessToken(config) {
    if (cached?.revision === config.revision && cached.expires > Date.now()) return cached.token;
    const response = await request(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: secrets.decrypt(config.secretCipher),
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    );
    assert(
      response.ok,
      'Verzeichniszugriff fehlgeschlagen. Gespeicherte Client-ID und Client-Geheimnis prüfen.',
      502,
    );
    const data = await response.json();
    assert(
      typeof data.access_token === 'string' && data.access_token,
      'Kein Zugriffstoken für das Verzeichnis erhalten.',
      502,
    );
    cached = {
      token: data.access_token,
      revision: config.revision,
      expires: Date.now() + Math.max(0, Math.min(Number(data.expires_in) || 0, 3600) - 60) * 1000,
    };
    return cached.token;
  }
  return async (query = '') => {
    const search = text(query, 100, 'Suchbegriff').trim();
    const config = getConfig();
    assert(
      config.tenantId && config.clientId && config.secretCipher,
      'Mandanten-ID, Client-ID und Client-Geheimnis zuerst speichern. Die Anmeldung kann dabei deaktiviert bleiben.',
    );
    const token = await accessToken(config);
    const literal = search.replaceAll("'", "''");
    const prefix = ['displayName', 'givenName', 'surname', 'mail', 'userPrincipalName']
      .map((field) => `startswith(${field},'${literal}')`)
      .join(' or ');
    const params = new URLSearchParams({
      $select: 'id,displayName,mail,userPrincipalName',
      $top: '25',
      $orderby: 'displayName',
      $count: 'true',
      $filter: search ? `accountEnabled eq true and (${prefix})` : 'accountEnabled eq true',
    });
    const response = await request(`https://graph.microsoft.com/v1.0/users?${params}`, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (response.status === 401) cached = null;
    assert(
      response.status !== 403,
      'Benutzersuche benötigt Microsoft Graph → Anwendungsberechtigung User.Read.All und Administratorzustimmung.',
      502,
    );
    assert(
      response.status !== 429,
      'Microsoft begrenzt gerade die Anfragen. Bitte kurz warten und erneut suchen.',
      429,
    );
    assert(
      response.ok,
      'Microsoft-Benutzersuche momentan nicht verfügbar. Berechtigungen und Verbindung prüfen.',
      502,
    );
    const data = await response.json();
    assert(Array.isArray(data.value), 'Ungültige Antwort des Benutzerverzeichnisses.', 502);
    assert(
      getConfig().revision === config.revision,
      'Konfiguration wurde geändert. Suche neu starten.',
      409,
    );
    return {
      users: data.value
        .filter((user) => typeof user.id === 'string' && guid.test(user.id))
        .slice(0, 25)
        .map((user) => ({
          oid: user.id.toLowerCase(),
          label: String(user.displayName || user.userPrincipalName || 'Benutzer').slice(0, 120),
          email: String(user.mail || user.userPrincipalName || '').slice(0, 254),
        })),
      more: Boolean(data['@odata.nextLink']),
    };
  };
}
