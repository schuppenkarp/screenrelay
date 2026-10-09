export function registerEntraRoutes({ app, auth, admin, master, entra, secure, rateLimit }) {
  const cookie = {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth/entra',
    maxAge: 600000,
  };
  app.get('/api/entra', admin, (req, res) => {
    const user = auth.identity(req),
      canManage = user.provider === 'master';
    res.json({ canManage, user, ...(canManage ? entra.settings() : { enabled: entra.enabled() }) });
  });
  app.get('/api/entra/users', master, async (req, res) => {
    try {
      res.json(await entra.searchUsers(req.query.q || ''));
    } catch (error) {
      res.status(error.status || 502).json({
        error: error.status
          ? error.message
          : 'Benutzerverzeichnis nicht erreichbar. Bitte erneut versuchen.',
      });
    }
  });
  app.put('/api/entra', master, (req, res) => res.json(entra.save(req.body)));
  app.post('/api/entra/check', master, rateLimit, async (req, res) => {
    try {
      res.json(await entra.check());
    } catch {
      res.status(400).json({
        error: 'Mandantenprüfung fehlgeschlagen. Konfiguration und Verbindung zu Microsoft prüfen.',
      });
    }
  });
  app.get('/api/auth/entra/start', rateLimit, (req, res) => {
    const flow = entra.start();
    res.cookie('wall_entra_flow', flow.binding, cookie);
    res.redirect(flow.url);
  });
  app.get('/api/auth/entra/callback', rateLimit, async (req, res) => {
    const binding = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('wall_entra_flow='))
      ?.slice('wall_entra_flow='.length);
    res.clearCookie('wall_entra_flow', cookie);
    res.set('Referrer-Policy', 'no-referrer');
    try {
      if (req.query.error) throw new Error('Microsoft sign-in cancelled');
      const identity = await entra.finish({
        state: req.query.state,
        code: req.query.code,
        binding,
      });
      auth.clear(req, res);
      auth.create(res, 'entra', identity);
      res.redirect('/');
    } catch {
      // Do not reflect provider errors, authorization codes, tokens or secrets.
      res.redirect('/?login=entra-failed');
    }
  });
}
