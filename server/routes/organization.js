import multer from 'multer';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  organization,
  publicAppearance,
  validateOrganization,
  neutralOrganization,
} from '../organization.js';
import { assert } from '../validation.js';

export function registerOrganizationRoutes({ app, store, admin, dataDir, calendar }) {
  app.get('/api/appearance', (req, res) => res.json(publicAppearance(organization(store))));
  app.get('/api/organization', admin, (req, res) => res.json(organization(store)));
  app.get('/api/calendar', admin, async (req, res) => {
    await calendar.refresh();
    res.json(calendar.state());
  });
  app.post('/api/calendar/refresh', admin, async (req, res) => {
    await calendar.refresh({ force: true });
    res.json(calendar.state());
  });
  app.put('/api/organization', admin, (req, res) => {
    const settings = validateOrganization(req.body, organization(store));
    store.set('organization', settings);
    void calendar.refresh();
    res.json(settings);
  });
  app.post('/api/organization/preset', admin, (req, res) => {
    assert(['neutral'].includes(req.body.preset), 'Unbekannte Vorlage.');
    const settings = {
      ...neutralOrganization,
    };
    if (req.body.preserveCalendar === true) {
      const current = organization(store);
      for (const key of [
        'calendarEnabled',
        'calendarUrl',
        'calendarHeading',
        'calendarRefreshSeconds',
        'calendarMaxEvents',
      ])
        settings[key] = current[key];
    }
    store.set('organization', settings);
    void calendar.refresh();
    res.json(settings);
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.post('/api/organization/images/:role', admin, upload.single('image'), async (req, res) => {
    assert(['logo', 'mark', 'favicon'].includes(req.params.role), 'Ungültige Bildrolle.');
    assert(req.file, 'Bitte ein Bild auswählen.');
    const image = sharp(req.file.buffer, { limitInputPixels: 20000000 });
    const metadata = await image.metadata();
    assert(
      ['png', 'jpeg', 'webp'].includes(metadata.format),
      'Logo bitte als PNG, JPG oder WebP hochladen.',
    );
    const buffer = await image
      .rotate()
      .resize({
        width: req.params.role === 'favicon' ? 128 : 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    await mkdir(path.join(dataDir, 'branding'), { recursive: true });
    const file = randomUUID() + '.png';
    await writeFile(path.join(dataDir, 'branding', file), buffer, { flag: 'wx' });
    const settings = { ...organization(store), [req.params.role]: '/branding/' + file };
    store.set('organization', settings);
    res.status(201).json(settings);
  });
  app.get('/branding/:file', (req, res) => {
    assert(/^[a-f0-9-]{36}\.png$/.test(req.params.file), 'Nicht gefunden.', 404);
    res.sendFile(path.join(dataDir, 'branding', req.params.file));
  });
}
