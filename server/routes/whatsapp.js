import path from 'node:path';
import { assert } from '../validation.js';
import { selectedGroupIds } from '../selected-groups.js';

export function registerWhatsappRoutes({ app, store, admin, whatsapp, dataDir }) {
  app.post('/api/whatsapp/start', admin, (req, res) => {
    store.set('settings', { ...store.settings(), whatsappEnabled: true });
    void whatsapp.start();
    res.json({ ok: true });
  });
  app.post('/api/whatsapp/stop', admin, async (req, res) => {
    store.set('settings', { ...store.settings(), whatsappEnabled: false });
    await whatsapp.stop();
    res.json({ ok: true });
  });
  app.post('/api/whatsapp/reset', admin, async (req, res) => {
    store.set('settings', { ...store.settings(), whatsappEnabled: false });
    await whatsapp.stop(true);
    // LocalAuth is restricted to this application-owned directory.
    const { rm } = await import('node:fs/promises');
    await rm(path.join(dataDir, 'whatsapp', 'session'), { recursive: true, force: true });
    res.json({ ok: true });
  });
  app.put('/api/whatsapp/group', admin, (req, res) => {
    const ids = req.body.groupIds ?? [req.body.groupId];
    assert(
      Array.isArray(ids) && ids.length <= 100 && ids.every((id) => typeof id === 'string'),
      'Ungültige Gruppenauswahl.',
    );
    const current = store.settings();
    const known = new Map(
      (current.groups || [])
        .filter((group) => selectedGroupIds(current).includes(group.id))
        .map((group) => [group.id, group]),
    );
    if (current.groupId && !known.has(current.groupId))
      known.set(current.groupId, { id: current.groupId, name: current.groupName });
    for (const group of whatsapp.state().groups) known.set(group.id, group);
    const groups = [...new Set(ids)].map((id) => known.get(id));
    assert(groups.every(Boolean), 'Bitte Gruppen aus der verbundenen Sitzung auswählen.');
    const groupRules = Object.create(null);
    for (const group of groups) {
      const rule = req.body.groupRules?.[group.id] ??
        current.groupRules?.[group.id] ?? { mode: 'all', hashtag: '' };
      assert(rule && ['all', 'hashtag'].includes(rule.mode), 'Ungültiger Importmodus.');
      const hashtag = typeof rule.hashtag === 'string' ? rule.hashtag.trim().normalize('NFC') : '';
      assert(
        (rule.mode !== 'hashtag' && !rule.allowPin) || /^#[\p{L}\p{N}_]{1,64}$/u.test(hashtag),
        'Bitte einen Hashtag wie #bilderwand eingeben (ohne Leerzeichen).',
      );
      const captionMode = rule.captionMode ?? (rule.mode === 'hashtag' ? 'none' : 'full');
      assert(['full', 'removeHashtag', 'none'].includes(captionMode), 'Ungültige Bildtextanzeige.');
      assert(
        rule.allowPin === undefined || typeof rule.allowPin === 'boolean',
        'Ungültige Fixinhalt-Option.',
      );
      groupRules[group.id] = {
        mode: rule.mode,
        hashtag,
        captionMode,
        allowPin: rule.allowPin ?? false,
      };
    }
    const patterns = req.body.groupPatterns ?? current.groupPatterns ?? [];
    assert(Array.isArray(patterns) && patterns.length <= 30, 'Maximal 30 Namensregeln möglich.');
    const groupPatterns = patterns.map((rule) => {
      assert(
        rule &&
          typeof rule.pattern === 'string' &&
          rule.pattern.trim().length > 0 &&
          rule.pattern.length <= 120,
        'Namensmuster fehlt oder ist zu lang.',
      );
      const hashtag = typeof rule.hashtag === 'string' ? rule.hashtag.trim().normalize('NFC') : '';
      assert(
        /^#[\p{L}\p{N}_]{1,64}$/u.test(hashtag),
        'Bitte einen Hashtag wie #bilderwand eingeben.',
      );
      const captionMode = rule.captionMode ?? 'removeHashtag';
      assert(['full', 'removeHashtag', 'none'].includes(captionMode), 'Ungültige Bildtextanzeige.');
      assert(
        rule.allowPin === undefined || typeof rule.allowPin === 'boolean',
        'Ungültige Fixinhalt-Option.',
      );
      return {
        pattern: rule.pattern.trim(),
        mode: 'hashtag',
        hashtag,
        captionMode,
        allowPin: rule.allowPin ?? false,
      };
    });
    store.set('settings', {
      ...current,
      groupPatterns,
      groupIds: groups.map((group) => group.id),
      groups,
      groupRules,
      groupId: groups[0]?.id || '',
      groupName: groups.map((group) => group.name).join(', '),
    });
    void whatsapp.recoverImages();
    res.json({ ok: true });
  });
  app.post('/api/whatsapp/groups/refresh', admin, async (req, res) => {
    assert(whatsapp.state().status === 'ready', 'WhatsApp ist noch nicht bereit.', 409);
    await whatsapp.refreshGroups();
    res.json(whatsapp.state());
  });
  app.post('/api/whatsapp/import/retry', admin, async (req, res) => {
    assert(whatsapp.state().status === 'ready', 'WhatsApp ist noch nicht bereit.', 409);
    assert(
      whatsapp.state().canRetryImport,
      'Kein fehlgeschlagener Import für die gewählte Gruppe vorhanden.',
      409,
    );
    await whatsapp.retryLastImport();
    res.json(whatsapp.state());
  });
}
