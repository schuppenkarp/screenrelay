import { equal } from '../auth.js';
import { assert } from '../validation.js';

export function registerIntegrationsRoutes({ app, store, admin, ai, drive, publicOrigin, secure }) {
  const driveCallback = (req) =>
    `${publicOrigin || `${req.protocol}://${req.get('host')}`}/api/drive/callback`;
  app.get('/api/drive', admin, async (req, res) => {
    await drive.ready;
    res.json({ ...drive.state(), redirectURI: driveCallback(req) });
  });
  app.put('/api/drive', admin, async (req, res) => {
    await drive.configure(req.body);
    void drive.sync();
    res.json(drive.state());
  });
  app.post('/api/drive/connect', admin, async (req, res) => {
    const url = await drive.authorize(driveCallback(req));
    // Only the short-lived OAuth nonce uses Lax; normal admin cookies remain Strict.
    res.cookie('wall_drive_oauth', new URL(url).searchParams.get('state'), {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/drive/callback',
      maxAge: 600000,
    });
    res.json({ url });
  });
  app.get('/api/drive/callback', async (req, res) => {
    const nonce = (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('wall_drive_oauth='))
      ?.slice('wall_drive_oauth='.length);
    assert(
      nonce && equal(nonce, String(req.query.state || '')),
      'Google-Anmeldung gehört nicht zu diesem Browser.',
      403,
    );
    res.clearCookie('wall_drive_oauth', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/drive/callback',
    });
    await drive.exchange(req.query);
    void drive.sync();
    res.redirect('/?drive=connected');
  });
  app.post('/api/drive/sync', admin, (req, res) => {
    assert(
      drive.state().connected && drive.state().enabled,
      'Bitte Drive verbinden und aktivieren.',
    );
    void drive.sync();
    res.json({ ...drive.state(), queued: true });
  });
  app.post('/api/drive/disconnect', admin, async (req, res) => res.json(await drive.disconnect()));
  app.get('/api/ai', admin, async (req, res) => {
    await ai.ready;
    res.json(ai.state());
  });
  app.put('/api/ai', admin, async (req, res) => {
    await ai.configure(req.body);
    res.json(ai.state());
  });
  app.post('/api/ai/review', admin, (req, res) => {
    assert(ai.enabled(), 'KI-Prüfung zuerst aktivieren.');
    for (const item of store.items().filter((item) => item.type === 'image'))
      void ai.review(item.id);
    res.json(ai.state());
  });
}
