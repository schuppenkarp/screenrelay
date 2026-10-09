import { readFileSync } from 'node:fs';
import { registerUpdateRoutes } from './routes/updates.js';
const appVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
import { entraService } from './entra.js';
import { registerEntraRoutes } from './routes/entra.js';
import { registerWhatsappRoutes } from './routes/whatsapp.js';
import { registerDisplayRoutes } from './routes/display.js';
import { registerItemsRoutes } from './routes/items.js';
import { registerIntegrationsRoutes } from './routes/integrations.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOrganizationRoutes } from './routes/organization.js';
import { registerStreamRoutes } from './routes/streams.js';
import { registerReolinkRoutes } from './routes/reolink.js';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.js';
import { authService } from './auth.js';
import { mediaService } from './media.js';
import { whatsappService } from './whatsapp.js';
import { calendarService } from './calendar.js';
import { aiService } from './ai.js';
import { driveService } from './drive.js';
import { organization, neutralOrganization } from './organization.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
export function createApp(config) {
  const {
    dataDir,
    secure = false,
    setupKey = '',
    publicOrigin = '',
    trustProxy = false,
    production = false,
    maxStorageMB = 1024,
  } = config;
  const store = openStore(dataDir);
  if (!store.get('organization')) store.set('organization', neutralOrganization);
  if (production && !store.db.prepare('SELECT id FROM admins').get() && setupKey.length < 24) {
    store.close();
    throw new Error(
      'Für die Ersteinrichtung auf dem VPS muss SETUP_KEY mindestens 24 Zeichen lang sein.',
    );
  }
  const app = express(),
    auth = authService(store, secure),
    media = mediaService(store, dataDir, maxStorageMB);
  const whatsapp = whatsappService(store, media, dataDir);
  const ai = aiService(store, dataDir);
  const drive = driveService(store, dataDir);
  drive.evictLocal = (id) => media.evictInactiveOriginal(id);
  media.changed = () => {
    void drive.sync();
  };
  media.ensureLocal = (item) => drive.ensureLocal(item);
  media.review = (id) => ai.review(id);
  const entra = entraService(store, dataDir, {
    publicOrigin,
    secure,
    request: config.entraRequest,
    jwks: config.entraJwks,
  });
  const calendar = calendarService(() => organization(store), config.calendarRequest);
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          frameSrc: ["'self'"],
          upgradeInsecureRequests: secure ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: secure ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '128kb' }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media'))
      res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = publicOrigin || `${req.protocol}://${req.get('host')}`;
      if ((origin && origin !== allowed) || req.headers['sec-fetch-site'] === 'cross-site')
        return res.status(403).json({ error: 'Anfrage von fremder Website blockiert.' });
    }
    next();
  });
  const admin = (req, res, next) =>
    auth.role(req) === 'admin' ? next() : res.status(401).json({ error: 'Bitte anmelden.' });
  const viewer = (req, res, next) => {
    if (!auth.role(req))
      return res
        .status(401)
        .json({ error: 'Bitte den Monitor über den Link aus dem Adminbereich verbinden.' });
    auth.refreshViewer(req, res);
    next();
  };
  const limits = new Map();
  const rateLimit = (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of limits) if (value.until < now) limits.delete(key);
    const key = req.ip,
      entry = limits.get(key) || { count: 0, until: now + 15 * 60_000 };
    entry.count++;
    limits.set(key, entry);
    if (entry.count > 15) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return res
        .status(429)
        .json({ error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' });
    }
    next();
  };
  const master = (req, res, next) =>
    auth.identity(req)?.provider === 'master'
      ? next()
      : res.status(403).json({ error: 'Dafür bitte mit dem Masterkennwort anmelden.' });
  registerUpdateRoutes({ app, admin, version: appVersion });
  registerEntraRoutes({ app, auth, admin, master, entra, secure, rateLimit });
  registerOrganizationRoutes({ app, store, admin, dataDir, calendar });
  app.get('/healthz', (req, res) =>
    res.json({ ok: true, service: 'screenrelay', version: appVersion }),
  );
  registerAuthRoutes({ app, store, auth, admin, rateLimit, production, setupKey, entra, master });
  registerAdminRoutes({ app, store, admin, whatsapp, drive, dataDir, maxStorageMB });
  registerIntegrationsRoutes({ app, store, admin, ai, drive, publicOrigin, secure });
  registerItemsRoutes({ app, store, admin, media, ai, drive });
  const streams = registerStreamRoutes({
    app,
    store,
    admin,
    viewer,
    auth,
    request: config.streamRequest,
  });
  const reolink = registerReolinkRoutes({ app, store, admin, request: config.streamRequest });
  registerDisplayRoutes({ app, store, auth, admin, viewer, rateLimit, drive, calendar, dataDir });
  registerWhatsappRoutes({ app, store, admin, whatsapp, dataDir });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));
  app.get('/display', (req, res) => res.sendFile(path.join(publicDir, 'display.html')));
  app.use(express.static(publicDir, { etag: true, maxAge: 0 }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400;
    res.status(status).json({
      error:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Die Datei überschreitet das zulässige Uploadlimit.'
          : status >= 500
            ? 'Serverfehler. Bitte erneut versuchen.'
            : error.message || 'Ungültige Anfrage.',
    });
  });
  if (ai.enabled())
    for (const row of store.db
      .prepare("SELECT item_id FROM image_reviews WHERE status='held' AND reason='Prüfung läuft'")
      .all())
      void ai.review(row.item_id);
  if (store.settings().whatsappEnabled) void whatsapp.start();
  return {
    app,
    store,
    media,
    whatsapp,
    drive,
    close: async () => {
      streams.close();
      reolink.close();
      await whatsapp.close();
      await ai.close();
      await drive.close();
      store.close();
    },
  };
}
