import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { holdImage } from './image-review.js';
import { moderateImage, checkOrientation } from './ai-providers.js';

export function aiService(store, dataDir, request = fetch) {
  const keys = {
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    openrouter: process.env.OPENROUTER_API_KEY || '',
  };
  let queue = Promise.resolve(),
    pending = 0,
    error = null;
  const ready = Promise.all(
    Object.keys(keys).map(async (provider) => {
      try {
        keys[provider] = (await readFile(path.join(dataDir, `${provider}-key`), 'utf8')).trim();
      } catch (e) {
        if (e.code !== 'ENOENT') error = 'Ein KI-Schlüssel konnte nicht gelesen werden.';
      }
    }),
  );
  const enabled = () => Boolean(store.get('aiEnabled'));
  const config = () => ({
    provider: 'off',
    geminiModel: '',
    openrouterModel: '',
    threshold: 0.2,
    cropEnabled: false,
    ...(store.get('aiOptions') || {}),
  });
  const approved = (id) =>
    store.db.prepare("SELECT 1 FROM image_reviews WHERE item_id=? AND status='approved'").get(id);
  async function review(id) {
    await ready;
    if (!enabled()) return;
    const item = store.item(id);
    if (!item?.file || approved(id)) return;
    const options = config(),
      credentials = { ...keys };
    holdImage(store, id, 'Prüfung läuft');
    store.db.prepare('UPDATE items SET crop_focus=NULL WHERE id=?').run(id);
    try {
      if (!credentials.openai) throw new Error('OpenAI-Schlüssel fehlt');
      const buffer = await sharp(await readFile(path.join(dataDir, 'media', item.file)))
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .jpeg()
        .toBuffer();
      let verdict = await moderateImage(
        request,
        credentials.openai,
        buffer,
        item.body || '',
        options.threshold,
      );
      // Do not send already flagged photos to a second provider.
      if (!verdict.hold && options.provider !== 'off' && store.item(id) && !approved(id)) {
        if (!credentials[options.provider])
          throw new Error('Schlüssel für Ausrichtungsprüfung fehlt');
        const orientation = await checkOrientation(
          request,
          options,
          credentials[options.provider],
          buffer,
        );
        verdict = {
          hold: orientation.hold,
          reason: `${verdict.reason}. ${orientation.reason}`,
          cropFocus: orientation.cropFocus,
          rotation: orientation.rotation,
        };
      }
      if (!store.item(id) || approved(id)) return;
      error = null;
      if (verdict.hold) {
        holdImage(store, id, verdict.reason.slice(0, 500));
        return;
      }
      store.db
        .prepare(
          "UPDATE image_reviews SET status='passed',reason=?,updated=? WHERE item_id=? AND status!='approved'",
        )
        .run(verdict.reason.slice(0, 500), Date.now(), id);
      store.db
        .prepare('UPDATE items SET visible=? WHERE id=?')
        .run(Number(!store.settings().moderation), id);
      if (verdict.rotation !== undefined)
        store.db
          .prepare('UPDATE items SET display_rotation=? WHERE id=? AND rotation_manual=0')
          .run(verdict.rotation, id);
      if (verdict.cropFocus)
        store.db
          .prepare('UPDATE items SET crop_focus=? WHERE id=? AND rotation_manual=0')
          .run(JSON.stringify(verdict.cropFocus), id);
    } catch (e) {
      error = e.message;
      if (store.item(id) && !approved(id))
        holdImage(store, id, `Prüfung nicht abgeschlossen: ${e.message}`);
    }
  }
  return {
    ready,
    enabled,
    state: () => ({
      enabled: enabled(),
      configured: Boolean(keys.openai),
      pending,
      error,
      moderationModel: 'omni-moderation-latest',
      ...config(),
      geminiConfigured: Boolean(keys.gemini),
      openrouterConfigured: Boolean(keys.openrouter),
    }),
    async configure(input) {
      await ready;
      if (!input || typeof input !== 'object') throw new Error('Ungültige KI-Einstellungen');
      const options = config();
      for (const field of [
        'provider',
        'geminiModel',
        'openrouterModel',
        'threshold',
        'cropEnabled',
      ])
        if (field in input) options[field] = input[field];
      if (typeof options.cropEnabled !== 'boolean')
        throw new Error('Ungültige Zuschnitt-Einstellung');
      if (options.cropEnabled && options.provider === 'off')
        throw new Error('Für intelligenten Zuschnitt bitte Gemini oder OpenRouter auswählen.');
      if (!['off', 'gemini', 'openrouter'].includes(options.provider))
        throw new Error('Ungültiger Ausrichtungsanbieter');
      if (
        typeof options.threshold !== 'number' ||
        !Number.isFinite(options.threshold) ||
        options.threshold < 0.01 ||
        options.threshold > 1
      )
        throw new Error('Prüfschwelle muss zwischen 0,01 und 1 liegen');
      for (const field of ['geminiModel', 'openrouterModel']) {
        if (
          typeof options[field] !== 'string' ||
          options[field].length > 160 ||
          (options[field] && !/^[a-zA-Z0-9_.:/-]+$/.test(options[field]))
        )
          throw new Error('Ungültige Modellkennung');
      }
      const nextKeys = { ...keys };
      for (const [provider, field] of [
        ['openai', 'key'],
        ['gemini', 'geminiKey'],
        ['openrouter', 'openrouterKey'],
      ]) {
        if (
          field in input &&
          (typeof input[field] !== 'string' || input[field].length > 512 || /\s/.test(input[field]))
        )
          throw new Error('Ungültiger Schlüssel');
        if (input[field]) nextKeys[provider] = input[field];
      }
      if ('enabled' in input && typeof input.enabled !== 'boolean')
        throw new Error('Ungültige Aktivierung');
      const nextEnabled = input.enabled ?? enabled();
      if (nextEnabled && !nextKeys.openai)
        throw new Error('Bitte zuerst einen OpenAI-API-Schlüssel eingeben');
      if (
        options.provider !== 'off' &&
        (!nextKeys[options.provider] || !options[`${options.provider}Model`])
      )
        throw new Error('Bitte Schlüssel und Modell für die Ausrichtungsprüfung eingeben');
      // Validate all fields before persisting secrets or enabling network requests.
      for (const provider of Object.keys(keys)) {
        if (nextKeys[provider] !== keys[provider])
          await writeFile(path.join(dataDir, `${provider}-key`), nextKeys[provider], {
            mode: 0o600,
          });
      }
      Object.assign(keys, nextKeys);
      store.set('aiOptions', options);
      store.set('aiEnabled', nextEnabled);
    },
    review(id) {
      if (enabled() && store.item(id) && !approved(id)) holdImage(store, id, 'Prüfung läuft');
      pending++;
      const task = queue.then(() => review(id)).finally(() => pending--);
      queue = task.catch(() => {});
      return task;
    },
    async close() {
      await queue;
    },
  };
}
