import { organization } from './organization.js';
import { readFile, writeFile, rename, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { displayItems } from './retention.js';
import { assert } from './validation.js';

const scope = 'https://www.googleapis.com/auth/drive.file';
const filesURL = 'https://www.googleapis.com/drive/v3/files';
const hash = (buffer) => createHash('md5').update(buffer).digest('hex');
export function driveService(store, dataDir, request = fetch) {
  const secretPath = path.join(dataDir, 'google-drive.json');
  let credentials = {},
    token = '',
    expires = 0,
    queue = Promise.resolve(),
    running = false,
    closed = false,
    lastError = null;
  const ready = readFile(secretPath, 'utf8')
    .then((s) => {
      credentials = JSON.parse(s);
    })
    .catch((e) => {
      if (e.code !== 'ENOENT') lastError = 'Google-Drive-Konfiguration nicht lesbar';
    });
  if (!store.get('driveInstallation')) store.set('driveInstallation', randomUUID());
  const installation = store.get('driveInstallation');
  store.db.exec(`CREATE TABLE IF NOT EXISTS drive_assets (
  asset_key TEXT PRIMARY KEY, item_id TEXT NOT NULL, kind TEXT NOT NULL,
  remote_id TEXT NOT NULL, parent TEXT NOT NULL, checksum TEXT NOT NULL,
  bytes INTEGER NOT NULL, synced INTEGER NOT NULL
 )`);
  const config = () => ({ enabled: false, cacheOnly: false, ...store.get('driveConfig') });
  const saveSecrets = async () => {
    await writeFile(secretPath + '.tmp', JSON.stringify(credentials), { mode: 0o600 });
    await rename(secretPath + '.tmp', secretPath);
  };
  const state = () => ({
    configured: Boolean(credentials.clientId && credentials.clientSecret),
    connected: Boolean(credentials.refreshToken),
    ...config(),
    running,
    error: lastError,
    lastSync: store.get('driveLastSync') || null,
    root: store.get('driveRoot') || null,
    assets: store.db.prepare('SELECT COUNT(*) AS n FROM drive_assets').get().n,
  });
  async function configure(input) {
    await ready;
    assert(typeof input === 'object' && input, 'Ungültige Drive-Konfiguration.');
    if (input.clientId) {
      assert(
        typeof input.clientId === 'string' &&
          input.clientId.length < 300 &&
          input.clientId.endsWith('.apps.googleusercontent.com'),
        'Ungültige Google-Client-ID.',
      );
      assert(
        !credentials.refreshToken || input.clientId === credentials.clientId,
        'Zum Wechsel der Client-ID zuerst die Verbindung trennen.',
      );
      credentials.clientId = input.clientId;
    }
    if (input.clientSecret) {
      assert(
        typeof input.clientSecret === 'string' &&
          input.clientSecret.length < 300 &&
          !/\s/.test(input.clientSecret),
        'Ungültiges Client-Secret.',
      );
      credentials.clientSecret = input.clientSecret;
    }
    assert(!input.enabled || credentials.refreshToken, 'Bitte zuerst Google Drive verbinden.');
    await saveSecrets();
    store.set('driveConfig', {
      enabled: Boolean(input.enabled),
      cacheOnly: Boolean(input.cacheOnly),
    });
    return state();
  }
  async function authorize(redirectURI) {
    await ready;
    assert(
      credentials.clientId && credentials.clientSecret,
      'Bitte zuerst Google-OAuth-Zugangsdaten speichern.',
    );
    const nonce = randomBytes(32).toString('hex'),
      verifier = randomBytes(32).toString('base64url');
    store.set('driveOAuth', { nonce, verifier, redirectURI, expires: Date.now() + 600000 });
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectURI,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state: nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
  }
  async function exchange(query) {
    await ready;
    const pending = store.get('driveOAuth'),
      given = String(query.state || '');
    assert(
      pending &&
        pending.expires > Date.now() &&
        given.length === pending.nonce.length &&
        timingSafeEqual(Buffer.from(given), Buffer.from(pending.nonce)),
      'Google-Anmeldung abgelaufen oder ungültig.',
    );
    store.set('driveOAuth', null);
    assert(!query.error && typeof query.code === 'string', 'Google-Anmeldung abgebrochen.');
    const result = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code: query.code,
        redirect_uri: pending.redirectURI,
        code_verifier: pending.verifier,
        grant_type: 'authorization_code',
      }),
    });
    assert(result.ok, 'Google-Anmeldung fehlgeschlagen.');
    const data = await result.json();
    assert(data.refresh_token, 'Kein dauerhafter Google-Zugang erhalten. Bitte erneut verbinden.');
    credentials.refreshToken = data.refresh_token;
    await saveSecrets();
    token = '';
    expires = 0;
    store.set('driveConfig', { ...config(), enabled: true });
    lastError = null;
    return state();
  }
  async function accessToken() {
    await ready;
    assert(credentials.refreshToken, 'Google Drive ist nicht verbunden.');
    if (token && expires > Date.now() + 60000) return token;
    const response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    assert(
      response.ok,
      `Google-Zugang erneuern fehlgeschlagen (HTTP ${response.status}). Bitte Verbindung prüfen.`,
    );
    const data = await response.json();
    assert(typeof data.access_token === 'string', 'Ungültige Google-Anmeldung.');
    token = data.access_token;
    expires = Date.now() + Number(data.expires_in || 3600) * 1000;
    return token;
  }
  async function api(url, options = {}) {
    const response = await request(url, {
      ...options,
      signal: AbortSignal.timeout(60000),
      headers: { ...options.headers, Authorization: 'Bearer ' + (await accessToken()) },
    });
    if (response.status === 401) {
      token = '';
      expires = 0;
    }
    if (!response.ok) {
      const error = Error(
        `Google Drive HTTP ${response.status}. Übertragung wird erneut versucht.`,
      );
      error.status = response.status;
      throw error;
    }
    return response;
  }
  async function find(key) {
    const q = `trashed=false and appProperties has { key='wallAsset' and value='${key}' }`;
    const response = await api(
      filesURL +
        '?' +
        new URLSearchParams({ q, fields: 'files(id,parents,md5Checksum,size)', pageSize: '2' }),
    );
    return (await response.json()).files?.[0];
  }
  async function folder(key, name, parent) {
    const existing = await find(key);
    if (existing) return existing.id;
    const response = await api(filesURL + '?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: { wallAsset: key },
        ...(parent ? { parents: [parent] } : {}),
      }),
    });
    return (await response.json()).id;
  }
  async function folders() {
    const root = await folder(installation + ':root', organization(store).driveFolderName);
    store.set('driveRoot', root);
    const result = {};
    for (const status of ['active', 'inactive', 'deleted'])
      result[status] = await folder(installation + ':' + status, status, root);
    return result;
  }
  function items() {
    const all = store.items().filter((i) => i.type === 'image'),
      active = new Set(displayItems(all, store.settings()).map((i) => i.id));
    return [
      ...all.map((item) => ({
        item,
        status: active.has(item.id) ? 'active' : 'inactive',
        folder: null,
      })),
      ...store.db
        .prepare('SELECT metadata FROM archived_items')
        .all()
        .map((row) => ({ item: JSON.parse(row.metadata), status: 'deleted', folder: 'deleted' }))
        .filter((x) => x.item.type === 'image'),
    ];
  }
  async function uploadAsset(entry, kind, name, buffer, parent) {
    const key = installation + ':' + entry.item.id + ':' + kind;
    let saved = store.db.prepare('SELECT * FROM drive_assets WHERE asset_key=?').get(key);
    assert(buffer || saved, 'Keine lokale oder gesicherte Datei vorhanden.');
    const checksum = buffer ? hash(buffer) : saved.checksum,
      bytes = buffer ? buffer.length : saved.bytes;
    if (saved && saved.checksum === checksum && saved.parent === parent) return;
    let remote = saved
      ? { id: saved.remote_id, parents: [saved.parent], md5Checksum: saved.checksum }
      : await find(key);
    if (remote && remote.md5Checksum === checksum) {
      if (!remote.parents?.includes(parent))
        await api(
          filesURL +
            '/' +
            remote.id +
            '?' +
            new URLSearchParams({
              addParents: parent,
              removeParents: (remote.parents || []).join(','),
              fields: 'id',
            }),
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        );
    } else {
      const metadata = {
        name,
        appProperties: { wallAsset: key },
        ...(!remote ? { parents: [parent] } : {}),
      };
      const params = new URLSearchParams({
        uploadType: 'resumable',
        fields: 'id,md5Checksum,size',
      });
      if (remote && !remote.parents?.includes(parent)) {
        params.set('addParents', parent);
        params.set('removeParents', (remote.parents || []).join(','));
      }
      const mime =
        kind === 'metadata'
          ? 'application/json'
          : name.endsWith('.png')
            ? 'image/png'
            : name.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg';
      const response = await api(
        'https://www.googleapis.com/upload/drive/v3/files' +
          (remote ? '/' + remote.id : '') +
          '?' +
          params,
        {
          method: remote ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': mime,
            'X-Upload-Content-Length': String(buffer.length),
          },
          body: JSON.stringify(metadata),
        },
      );
      const location = response.headers.get('location');
      assert(
        location && new URL(location).origin === 'https://www.googleapis.com',
        'Ungültiges Google-Uploadziel.',
      );
      const uploaded = await api(location, {
        method: 'PUT',
        headers: { 'Content-Type': mime, 'Content-Length': String(buffer.length) },
        body: buffer,
      });
      remote = await uploaded.json();
      assert(
        remote.md5Checksum === checksum && Number(remote.size) === buffer.length,
        'Google-Drive-Dateiprüfung fehlgeschlagen. Lokale Datei bleibt erhalten.',
      );
    }
    store.db
      .prepare(
        'INSERT INTO drive_assets VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(asset_key) DO UPDATE SET remote_id=excluded.remote_id,parent=excluded.parent,checksum=excluded.checksum,bytes=excluded.bytes,synced=excluded.synced',
      )
      .run(key, entry.item.id, kind, remote.id, parent, checksum, bytes, Date.now());
  }
  async function bufferFor(entry, kind, name) {
    assert(path.basename(name) === name, 'Ungültiger Bildpfad.');
    const folder = entry.folder || (kind === 'original' ? 'originals' : 'media');
    try {
      return await readFile(path.join(dataDir, folder, name));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      assert(
        store.db
          .prepare('SELECT 1 FROM drive_assets WHERE item_id=? AND kind=?')
          .get(entry.item.id, kind),
        'Lokales Bild fehlt und ist noch nicht in Drive gesichert.',
      );
      return null;
    }
  }
  async function download(id, kind) {
    const asset = store.db
      .prepare('SELECT * FROM drive_assets WHERE item_id=? AND kind=?')
      .get(id, kind);
    assert(asset, 'Bild noch nicht in Google Drive gesichert.');
    const response = await api(filesURL + '/' + asset.remote_id + '?alt=media');
    const buffer = Buffer.from(await response.arrayBuffer());
    assert(
      hash(buffer) === asset.checksum && buffer.length === asset.bytes,
      'Cache-Wiederherstellung fehlgeschlagen: Prüfsumme stimmt nicht.',
    );
    return buffer;
  }
  async function ensureLocal(item, includeOriginal = true) {
    for (const [kind, name, folder] of [
      ['display', item.file, 'media'],
      ['original', item.original_file, 'originals'],
    ]) {
      if (!name || (!includeOriginal && kind === 'original')) continue;
      assert(path.basename(name) === name, 'Ungültiger Bildpfad.');
      const target = path.join(dataDir, folder, name);
      try {
        await access(target);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        const buffer = await download(item.id, kind);
        const temporary = target + '.' + randomUUID() + '.tmp';
        await writeFile(temporary, buffer);
        await rename(temporary, target);
      }
    }
  }
  async function sync() {
    await ready;
    if (closed || !config().enabled || !credentials.refreshToken) return;
    running = true;
    lastError = null;
    try {
      const parents = await folders();
      for (const entry of items()) {
        if (closed || !config().enabled) break;
        try {
          for (const [kind, name] of [
            ['original', entry.item.original_file],
            ['display', entry.item.file],
          ])
            if (name)
              await uploadAsset(
                entry,
                kind,
                name,
                await bufferFor(entry, kind, name),
                parents[entry.status],
              );
          const metadata = Buffer.from(
            JSON.stringify(
              {
                ...entry.item,
                archiveStatus: entry.status,
                review:
                  store.db
                    .prepare('SELECT status,reason FROM image_reviews WHERE item_id=?')
                    .get(entry.item.id) || null,
              },
              null,
              2,
            ),
          );
          await uploadAsset(
            entry,
            'metadata',
            entry.item.id + '.json',
            metadata,
            parents[entry.status],
          );
          // Evict only immutable deleted files after all assets have been verified remotely.
          if (config().cacheOnly && entry.status === 'deleted')
            for (const name of [entry.item.file, entry.item.original_file].filter(Boolean))
              await unlink(path.join(dataDir, 'deleted', name)).catch((e) => {
                if (e.code !== 'ENOENT') throw e;
              });
          if (config().cacheOnly && entry.status === 'inactive')
            await service.evictLocal?.(entry.item.id);
        } catch (e) {
          lastError = e.message;
        }
      }
      if (!lastError) store.set('driveLastSync', Date.now());
    } catch (e) {
      lastError = e.message;
    } finally {
      running = false;
    }
  }
  function schedule() {
    const task = queue.then(sync);
    queue = task.catch(() => {});
    return task;
  }
  const timer = setInterval(() => {
    if (!running && !closed) void schedule();
  }, 60000);
  timer.unref();
  void ready.then(() => schedule());
  const service = {
    state,
    ready,
    configure,
    authorize,
    exchange,
    sync: schedule,
    ensureLocal,
    async disconnect() {
      await ready;
      store.set('driveConfig', { ...config(), enabled: false });
      await queue;
      delete credentials.refreshToken;
      await saveSecrets();
      token = '';
      expires = 0;
      return state();
    },
    async close() {
      closed = true;
      clearInterval(timer);
      await queue;
    },
  };
  return service;
}
