import { equal, hashPassword, checkPassword } from '../auth.js';
import { assert, text } from '../validation.js';

export function registerAuthRoutes({
  app,
  store,
  auth,
  rateLimit,
  production,
  setupKey,
  entra,
  master,
}) {
  app.get('/api/session', (req, res) =>
    res.json({
      role: auth.role(req),
      user: auth.identity(req),
      entraEnabled: entra.enabled(),
      setup: !store.db.prepare('SELECT id FROM admins').get(),
      requiresSetupKey: production || Boolean(setupKey),
    }),
  );
  app.post('/api/setup', rateLimit, async (req, res) => {
    assert(!store.db.prepare('SELECT id FROM admins').get(), 'Bereits eingerichtet.', 409);
    if (production || setupKey)
      assert(equal(req.body.setupKey || '', setupKey), 'Einrichtungsschlüssel ist ungültig.', 403);
    else
      assert(
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress),
        'Ersteinrichtung nur lokal oder mit SETUP_KEY möglich.',
        403,
      );
    const password = text(req.body.password, 256, 'Passwort', true);
    assert(password.length >= 12, 'Bitte mindestens 12 Zeichen für das Passwort verwenden.');
    const hash = await hashPassword(password);
    assert(!store.db.prepare('SELECT id FROM admins').get(), 'Bereits eingerichtet.', 409);
    store.db.prepare('INSERT INTO admins VALUES (1,?)').run(hash);
    auth.create(res, 'admin');
    res.json({ ok: true });
  });
  app.post('/api/login', rateLimit, async (req, res) => {
    const password = text(req.body.password, 256, 'Passwort', true);
    const user = store.db.prepare('SELECT hash FROM admins WHERE id=1').get();
    assert(user && (await checkPassword(password, user.hash)), 'Passwort ist nicht korrekt.', 401);
    auth.create(res, 'admin');
    res.json({ ok: true });
  });
  app.post('/api/logout', (req, res) => {
    auth.clear(req, res);
    res.json({ ok: true });
  });
  app.post('/api/password', master, rateLimit, async (req, res) => {
    const oldPassword = text(req.body.oldPassword, 256, 'Aktuelles Passwort', true);
    const password = text(req.body.password, 256, 'Neues Passwort', true);
    assert(password.length >= 12, 'Bitte mindestens 12 Zeichen verwenden.');
    assert(
      await checkPassword(
        oldPassword,
        store.db.prepare('SELECT hash FROM admins WHERE id=1').get().hash,
      ),
      'Aktuelles Passwort ist nicht korrekt.',
      403,
    );
    store.db.prepare('UPDATE admins SET hash=? WHERE id=1').run(await hashPassword(password));
    store.db.prepare("DELETE FROM sessions WHERE role IN ('admin','entra')").run();
    auth.create(res, 'admin');
    res.json({ ok: true });
  });
}
