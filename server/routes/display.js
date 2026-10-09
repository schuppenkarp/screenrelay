import { groupRule } from '../selected-groups.js';
import path from 'node:path';
import sharp from 'sharp';
import { displayCaption } from '../display-caption.js';
import { assert, text } from '../validation.js';
import { organization, publicAppearance } from '../organization.js';
import { displayItems } from '../retention.js';
import { senderName } from '../sender-name.js';
import { touchItems } from '../streams.js';

export function registerDisplayRoutes({
  app,
  store,
  auth,
  admin,
  viewer,
  rateLimit,
  drive,
  calendar,
  dataDir,
}) {
  const access = auth.viewers;
  const present = (row) => ({
    id: row.id,
    name: row.name,
    created: row.created,
    path: access.path(row),
  });
  app.get('/api/viewer-tokens', admin, (req, res) => res.json(access.list().map(present)));
  app.post('/api/viewer-tokens', admin, (req, res) => {
    const name = text(req.body.name, 80, 'Name', true);
    assert(access.list().length < 100, 'Maximal 100 Monitor-Zugänge möglich.');
    res.status(201).json(present(access.create(name)));
  });
  app.delete('/api/viewer-tokens/:id', admin, (req, res) => {
    assert(
      access.list().some((row) => row.id === req.params.id),
      'Zugang nicht gefunden.',
      404,
    );
    access.revoke(req.params.id);
    res.json({ ok: true });
  });
  // Compatibility endpoints for older administration clients.
  app.get('/api/display-link', admin, (req, res) => {
    const row = access.list()[0];
    assert(row, 'Bitte zuerst einen Monitor-Zugang erstellen.', 404);
    res.json({ path: access.path(row) });
  });
  app.post('/api/display-link/rotate', admin, (req, res) => {
    for (const row of access.list()) access.revoke(row.id);
    access.create('Monitor');
    res.json({ ok: true });
  });
  // Exchange a bookmarkable viewer link for an HttpOnly session. Never forward the
  // secret to assets or leave it in the final URL. Legacy fragment links still work.
  app.get(['/display', '/display.html'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    if (!Object.hasOwn(req.query, 'token')) return next();
    rateLimit(req, res, () => {
      const row = access.find(req.query.token);
      if (!row) {
        return res.status(403).type('text').send('Monitor-Link ist ungültig oder wurde erneuert.');
      }
      auth.create(res, 'display', { tokenId: row.id });
      res.redirect(303, '/display');
    });
  });
  app.post('/api/display/session', rateLimit, (req, res) => {
    const row = access.find(req.body.token);
    assert(row, 'Monitor-Link ist ungültig oder wurde erneuert.', 403);
    auth.create(res, 'display', { tokenId: row.id });
    res.json({ ok: true });
  });
  app.get('/api/display/feed', viewer, (req, res) => {
    const settings = store.settings();
    const captionForDisplay = (item) => {
      if (item.source === 'whatsapp') {
        const receipt = store.db
          .prepare('SELECT group_id FROM receipts WHERE message_id=?')
          .get(item.message_id);
        return displayCaption(item, receipt ? groupRule(settings, receipt.group_id) : null);
      }
      return displayCaption(item, null);
    };
    res.json({
      appearance: publicAppearance(organization(store)),
      calendar: calendar.state(),
      settings: Object.fromEntries(
        [
          'photosPerScreen',
          'title',
          'photoDuration',
          'pinDuration',
          'pinInterval',
          'transition',
          'transitionDuration',
          'fit',
          'showCaptions',
          'layoutColumns',
          'layoutRows',
          'layoutGap',
          'layoutPadding',
          'layoutLeftPercent',
          'noticePosition',
          'portraitFeature',
          'touchEnabled',
          'touchDuration',
          'touchColumns',
        ].map((key) => [key, settings[key]]),
      ),
      smartCrop: Boolean(store.get('aiOptions')?.cropEnabled),
      touchItems: touchItems(store.items().map(captionForDisplay), settings),
      items: displayItems(store.items(), settings)
        .filter((item) => item.rotation_visible !== false)
        .map(captionForDisplay)
        .map(
          ({
            id,
            type,
            title,
            body,
            url,
            pinned,
            duration,
            sort_order,
            theme,
            sender,
            stream_kind,
            crop_focus,
          }) => ({
            id,
            type,
            title,
            body,
            url,
            pinned,
            duration,
            sort_order,
            theme,
            stream_kind,
            crop_focus,
            sender: senderName(sender),
          }),
        ),
    });
  });
  app.get('/media/:file', viewer, async (req, res) => {
    assert(/^[a-f0-9-]{36}\.jpg$/.test(req.params.file), 'Nicht gefunden.', 404);
    const row = store.db
      .prepare('SELECT visible,display_rotation FROM items WHERE file=?')
      .get(req.params.file);
    assert(row && (row.visible || auth.role(req) === 'admin'), 'Nicht gefunden.', 404);
    await drive.ensureLocal(
      store.items().find((item) => item.file === req.params.file),
      false,
    );
    if ([90, 180, 270].includes(row.display_rotation)) {
      const image = await sharp(path.join(dataDir, 'media', req.params.file))
        .rotate(row.display_rotation)
        .jpeg({ quality: 90 })
        .toBuffer();
      res.type('jpeg').set('Cache-Control', 'private, no-cache').send(image);
    } else res.sendFile(path.join(dataDir, 'media', req.params.file), { cacheControl: false });
  });
}
