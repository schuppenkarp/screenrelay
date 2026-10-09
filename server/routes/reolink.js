import { randomUUID } from 'node:crypto';
import { assert } from '../validation.js';
import { validateStream } from '../streams.js';
import { reolinkSessions } from '../reolink.js';

export function recorderAddress(value) {
  assert(
    typeof value === 'string' && value.trim() && value.length <= 1000,
    'Bitte Recorder-IP oder Hostname eingeben.',
  );
  let url;
  try {
    url = new URL(value.includes('://') ? value.trim() : 'http://' + value.trim());
  } catch {
    assert(false, 'Ungültige Recorder-Adresse.');
  }
  assert(
    ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
    'HTTP/HTTPS-Adresse ohne Zugangsdaten verwenden.',
  );
  assert(
    url.pathname === '/' && !url.search && !url.hash,
    'Nur Recorder-IP oder Hostname, optional mit Port, eingeben.',
  );
  return url.origin;
}

export function registerReolinkRoutes({ app, store, admin, request = fetch }) {
  const discoveries = new Map();
  const sessions = reolinkSessions(request);
  const existing = (origin, channel) =>
    store.items().find((item) => {
      if (item.type !== 'stream' || item.stream_kind !== 'reolink') return false;
      const source = new URL(item.stream_url);
      return (
        source.origin === origin &&
        source.searchParams.get('stream')?.match(/^channel(\d+)_/)?.[1] === String(channel)
      );
    });
  app.post('/api/reolink/channels', admin, async (req, res) => {
    const origin = recorderAddress(req.body.address);
    const username = req.body.username;
    assert(
      typeof username === 'string' && username.length > 0 && username.length <= 200,
      'Bitte Benutzername eingeben.',
    );
    let password = req.body.password;
    if (!password && req.body.existingItemId) {
      const saved = store.item(req.body.existingItemId);
      assert(
        saved?.type === 'stream' &&
          saved.stream_kind === 'reolink' &&
          new URL(saved.stream_url).origin === origin &&
          saved.stream_username === username,
        'Gespeicherte Anmeldung passt nicht zu diesem Recorder.',
      );
      password = store.cameraPassword(saved);
    }
    assert(
      typeof password === 'string' && password.length > 0 && password.length <= 4096,
      'Bitte Passwort eingeben.',
    );
    const id = randomUUID();
    try {
      const source = await sessions.source({
        id,
        stream_url: origin + '/flv',
        stream_username: username,
        stream_password: password,
      });
      const api = new URL('/cgi-bin/api.cgi', origin);
      api.searchParams.set('token', source.searchParams.get('token'));
      const response = await request(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { cmd: 'GetChannelstatus', action: 0, param: {} },
          { cmd: 'GetNetPort', action: 0, param: {} },
        ]),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      assert(response.ok, 'Recorder antwortet nicht.');
      const result = await response.json();
      const status = result.find((row) => row.cmd === 'GetChannelstatus');
      assert(
        status?.code === 0 && Array.isArray(status.value?.status),
        'Kanalliste konnte nicht gelesen werden. Bitte Berechtigungen prüfen.',
      );
      const ports = result.find((row) => row.cmd === 'GetNetPort')?.value?.NetPort;
      assert(ports?.rtmpEnable !== 0, 'Am Recorder muss RTMP/HTTP-FLV aktiviert sein.');
      const port = ports?.rtmpPort ?? 1935;
      assert(
        Number.isInteger(port) && port > 0 && port < 65536,
        'Ungültiger Stream-Port des Recorders.',
      );
      const channels = status.value.status
        .filter((row) => Number.isInteger(row.channel) && row.channel >= 0 && row.channel < 256)
        .map((row) => ({
          channel: row.channel,
          name: String(row.name || `Kanal ${row.channel + 1}`).slice(0, 100),
          online: Boolean(row.online),
          existing: Boolean(existing(origin, row.channel)),
        }));
      assert(channels.length > 0, 'Keine Kamerakanäle verfügbar.');
      for (const [key, entry] of discoveries)
        if (entry.expires < Date.now()) discoveries.delete(key);
      while (discoveries.size >= 30) discoveries.delete(discoveries.keys().next().value);
      const secret = store.protectStream({ stream_password: password }).stream_password_cipher;
      discoveries.set(id, {
        origin,
        username,
        secret,
        channels,
        port,
        expires: Date.now() + 10 * 60000,
      });
      res.json({ discoveryId: id, channels });
    } catch (error) {
      res.status(400).json({
        error:
          error.status && error.status < 500
            ? error.message
            : 'Recorder-Anmeldung oder Kanalabruf fehlgeschlagen. Adresse, Zugangsdaten und Verbindung prüfen.',
      });
    } finally {
      sessions.invalidate(id);
    }
  });
  app.post('/api/reolink/import', admin, (req, res) => {
    const found = discoveries.get(req.body.discoveryId);
    assert(
      found && found.expires > Date.now(),
      'Kameraliste abgelaufen. Bitte Kameras erneut laden.',
    );
    const selected = req.body.channels;
    assert(
      Array.isArray(selected) &&
        selected.length > 0 &&
        selected.length <= 64 &&
        selected.every(
          (channel) =>
            Number.isInteger(channel) && found.channels.some((row) => row.channel === channel),
        ),
      'Bitte gültige Kamerakanäle auswählen (maximal 64).',
    );
    const created = [],
      reused = [],
      ids = [];
    const rotation = req.body.rotation_visible !== false;
    const touch = req.body.addToTouch === true;
    const settings = store.settings();
    store.db.exec('BEGIN');
    try {
      for (const channel of new Set(selected)) {
        const saved = existing(found.origin, channel);
        if (saved) {
          reused.push(saved.id);
          ids.push(saved.id);
          continue;
        }
        const source = new URL('/flv', found.origin);
        source.search = new URLSearchParams({
          port: String(found.port),
          app: 'bcs',
          stream: `channel${channel}_sub.bcs`,
        });
        const info = found.channels.find((row) => row.channel === channel);
        const item = validateStream(
          {
            title: info.name,
            stream_url: source.href,
            stream_kind: 'reolink',
            stream_username: found.username,
          },
          { stream_password_cipher: found.secret },
        );
        const id = randomUUID();
        store.db
          .prepare(
            "INSERT INTO items(id,type,title,source,created,pinned,visible,rotation_visible,stream_url,stream_kind,stream_username,stream_password_cipher) VALUES (?,'stream',?,'admin',?,1,1,?,?,'reolink',?,?)",
          )
          .run(
            id,
            item.title,
            Date.now(),
            Number(rotation),
            source.href,
            found.username,
            found.secret,
          );
        created.push(id);
        ids.push(id);
      }
      if (touch) {
        const touchItemIds = [...new Set([...settings.touchItemIds, ...ids])];
        assert(
          touchItemIds.length <= 12,
          'Die Touch-Ansicht erlaubt maximal 12 Inhalte. Weniger Kanäle wählen oder die Touch-Auswahl abwählen.',
        );
        store.set('settings', { ...settings, touchItemIds });
      }
      store.db.exec('COMMIT');
    } catch (error) {
      store.db.exec('ROLLBACK');
      throw error;
    }
    res.json({ created: created.length, existing: reused.length });
  });
  return {
    close() {
      discoveries.clear();
      sessions.clear();
    },
  };
}
