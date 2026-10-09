import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assert } from '../validation.js';
import { validateStream, rewritePlaylist, streamAssets } from '../streams.js';
import { reolinkSessions } from '../reolink.js';
import { adminItem } from '../camera-secrets.js';

export function registerStreamRoutes({ app, store, admin, viewer, auth, request = fetch }) {
  const assets = streamAssets(),
    reolink = reolinkSessions(request),
    connections = new Map(),
    controllers = new Set();
  app.post('/api/items/stream', admin, (req, res) => {
    const item = store.protectStream(validateStream(req.body)),
      id = randomUUID();
    store.db
      .prepare(
        `INSERT INTO items (id,type,title,source,created,pinned,visible,duration,sort_order,stream_url,stream_kind,rotation_visible,stream_username,stream_password_cipher) VALUES (?,'stream',?,'admin',?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        item.title,
        Date.now(),
        Number(item.pinned),
        Number(item.visible),
        item.duration,
        item.sort_order,
        item.stream_url,
        item.stream_kind,
        Number(item.rotation_visible),
        item.stream_username,
        item.stream_password_cipher,
      );
    res.status(201).json(adminItem(store.item(id)));
  });
  const proxy = async (req, res) => {
    const item = store.item(req.params.id),
      role = auth.role(req);
    assert(
      item?.type === 'stream' && (item.visible || role === 'admin'),
      'Kamera nicht verfügbar.',
      404,
    );
    assert(
      (connections.get(item.id) || 0) < 16 && controllers.size < 96,
      'Zu viele gleichzeitige Kameraverbindungen.',
      429,
    );
    const root = new URL(item.stream_url);
    let target = new URL(
      req.params.key ? assets.get(item.id, req.params.key) || 'invalid:' : item.stream_url,
    );
    assert(target.origin === root.origin, 'Streamdatei nicht verfügbar.', 404);
    const controller = new AbortController();
    controllers.add(controller);
    connections.set(item.id, (connections.get(item.id) || 0) + 1);
    res.once('close', () => controller.abort());
    const handshake = setTimeout(() => controller.abort(), 10000);
    let playlistTimeout;
    const permissionTimer = setInterval(() => {
      const current = store.item(item.id);
      if (
        !auth.role(req) ||
        !current ||
        (auth.role(req) !== 'admin' && !current.visible) ||
        current.stream_url !== item.stream_url ||
        current.stream_password_cipher !== item.stream_password_cipher ||
        current.stream_username !== item.stream_username
      )
        controller.abort();
    }, 10000);
    permissionTimer.unref();
    try {
      const password = store.cameraPassword(item);
      if (item.stream_kind === 'reolink')
        target = await reolink.source({ ...item, stream_password: password });
      const headers = {};
      if (item.stream_kind !== 'reolink' && (item.stream_username || password))
        headers.Authorization =
          'Basic ' + Buffer.from(item.stream_username + ':' + password).toString('base64');
      if (req.headers.range && /^bytes=\d*-\d*$/.test(req.headers.range))
        headers.Range = req.headers.range;
      let response;
      for (let attempt = 0; attempt < 4; attempt++) {
        assert(
          target.origin === root.origin,
          'Kamera-Weiterleitung auf andere Server ist nicht erlaubt.',
          502,
        );
        target.username = '';
        target.password = '';
        response = await request(target, {
          headers,
          signal: controller.signal,
          redirect: 'manual',
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        await response.body?.cancel();
        target = new URL(response.headers.get('location'), target);
      }
      clearTimeout(handshake);
      assert(response.ok, 'Kameraserver nicht erreichbar oder Anmeldung abgelehnt.', 502);
      const type = response.headers.get('content-type') || '';
      const playlist =
        item.stream_kind === 'hls' && (/mpegurl/i.test(type) || target.pathname.endsWith('.m3u8'));
      if (playlist) {
        playlistTimeout = setTimeout(() => controller.abort(), 15000);
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          assert(bytes <= 1024 * 1024, 'HLS-Liste zu groß.', 502);
          chunks.push(Buffer.from(chunk));
        }
        res
          .type('application/vnd.apple.mpegurl')
          .send(
            rewritePlaylist(Buffer.concat(chunks).toString('utf8'), target, root, (url) =>
              assets.register(item.id, url),
            ),
          );
      } else {
        assert(
          /^(multipart\/x-mixed-replace|image\/jpeg|video\/|audio\/|application\/octet-stream)/i.test(
            type,
          ),
          'Nicht unterstützte Kameraantwort.',
          502,
        );
        res
          .status(response.status)
          .set('Content-Type', type)
          .set('Cache-Control', 'no-store')
          .set('X-Accel-Buffering', 'no');
        for (const header of ['content-length', 'content-range', 'accept-ranges'])
          if (response.headers.get(header)) res.set(header, response.headers.get(header));
        await pipeline(Readable.fromWeb(response.body), res, { signal: controller.signal });
      }
    } catch (error) {
      // A camera reboot can invalidate a token before its advertised expiry.
      if (item.stream_kind === 'reolink' && !controller.signal.aborted) reolink.invalidate(item.id);
      if (!res.headersSent && !res.destroyed)
        res
          .status(error.status || 502)
          .json({ error: error.status ? error.message : 'Kamera momentan nicht erreichbar.' });
      else res.destroy();
    } finally {
      clearTimeout(handshake);
      clearTimeout(playlistTimeout);
      clearInterval(permissionTimer);
      controller.abort();
      controllers.delete(controller);
      connections.set(item.id, Math.max(0, (connections.get(item.id) || 1) - 1));
    }
  };
  app.get('/api/streams/:id/live', viewer, proxy);
  app.get('/api/streams/:id/asset/:key', viewer, proxy);
  return {
    close() {
      reolink.clear();
      for (const controller of controllers) controller.abort();
    },
  };
}
