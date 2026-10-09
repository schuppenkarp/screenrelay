import { rotateByReaction } from './rotate-image.js';
import { selectedGroupIds, selectedGroupsSql, acceptsGroup } from './selected-groups.js';
import { organization } from './organization.js';
import path from 'node:path';
import QRCode from 'qrcode';
import { importMessage, acknowledge } from './import-message.js';
import { loadGroups } from './groups.js';
import { normalizeMessageId } from './message-id.js';
import { installMessageCompatibility } from './whatsapp-compat.js';
import { deleteByReaction } from './delete-reaction.js';
import { updateImageCaption } from './edit-message.js';
import { approveByReaction } from './image-review.js';
import { recentImageIds } from './recover-messages.js';
import { retireWhatsAppClient, retireProfileBrowser } from './whatsapp-browser.js';

export function whatsappService(store, media, dataDir) {
  let client = null,
    generation = 0,
    retry = null,
    closed = false;
  let state = {
    status: 'disconnected',
    qr: null,
    error: null,
    reactionError: null,
    lastImport: null,
    groups: [],
  };
  let importQueue = Promise.resolve(),
    groupsBusy = false,
    frameFailures = 0,
    recoveryBusy = false;
  const update = (values) => {
    // Operational status only; never log QR codes, messages or account identifiers.
    if (values.status && values.status !== state.status) console.log(`[WhatsApp] ${values.status}`);
    if (values.error && values.error !== state.error) console.warn(`[WhatsApp] ${values.error}`);
    state = { ...state, ...values };
  };
  const retryReactions = () => {
    importQueue = importQueue
      .then(async () => {
        if (state.status !== 'ready' || !store.settings().whatsappEnabled) return;
        const pending = store.db
          .prepare(
            `SELECT r.message_id FROM receipts r LEFT JOIN items i ON i.message_id=r.message_id LEFT JOIN image_reviews v ON v.item_id=i.id WHERE r.group_id IN (SELECT value FROM json_each(?)) AND (r.reacted=0 OR (v.status='held' AND v.reason!='Prüfung läuft' AND (v.reacted=0 OR v.replied=0))) LIMIT 25`,
          )
          .all(selectedGroupsSql(store.settings()));
        for (const row of pending) {
          if (state.status !== 'ready' || !client) return;
          try {
            const message = await client.getMessageById(row.message_id);
            if (message) await acknowledge(message, store);
          } catch {
            update({
              reactionError:
                'Einige 👍-Reaktionen sind noch ausständig. Automatischer erneuter Versuch.',
            });
          }
        }
        if (
          !store.db
            .prepare(
              'SELECT 1 FROM receipts WHERE reacted=0 AND group_id IN (SELECT value FROM json_each(?)) LIMIT 1',
            )
            .get(selectedGroupsSql(store.settings()))
        )
          update({ reactionError: null });
      })
      .catch(() => {});
  };
  const reactionTimer = setInterval(retryReactions, 60_000);
  reactionTimer.unref();
  const refreshGroups = async () => {
    if (groupsBusy || !client || state.status !== 'ready' || closed) return;
    const current = generation;
    groupsBusy = true;
    update({ groupsLoading: true });
    let watchdog;
    try {
      const groups = await Promise.race([
        loadGroups(client),
        new Promise((_, reject) => {
          watchdog = setTimeout(() => reject(new Error('Zeitüberschreitung')), 20_000);
        }),
      ]);
      if (current !== generation || closed) return;
      const previousSelection = new Set(selectedGroupIds(store.settings()));
      if (JSON.stringify(store.get('knownGroups')) !== JSON.stringify(groups))
        store.set('knownGroups', groups);
      update({ groups, groupsError: null });
      if (selectedGroupIds(store.settings()).some((id) => !previousSelection.has(id)))
        void recoverImages();
      frameFailures = 0;
      console.log(`[WhatsApp] ${groups.length} Gruppen geladen`);
    } catch (error) {
      if (current === generation && !closed) {
        console.warn('[WhatsApp] Gruppenabruf fehlgeschlagen:', error.message);
        update({
          groupsError:
            'Gruppen werden noch synchronisiert. Automatischer erneuter Versuch; alternativ „Gruppen aktualisieren“ wählen.',
        });
        if (
          /detached Frame|Target closed|Session closed|Execution context|Zeitüberschreitung/i.test(
            error.message,
          ) &&
          ++frameFailures >= 3
        ) {
          update({
            status: 'error',
            error: 'WhatsApp-Browser reagiert nicht mehr. Verbindung wird automatisch erneuert.',
          });
          reconnect();
        }
      }
    } finally {
      clearTimeout(watchdog);
      groupsBusy = false;
      if (current === generation) update({ groupsLoading: false });
    }
  };
  const groupsTimer = setInterval(() => void refreshGroups(), 30_000);
  groupsTimer.unref();
  const processImage = async (message, active) => {
    try {
      const result = await importMessage(message, store, media, active);
      if (result) {
        if (store.get('failedImport')?.id === message.id._serialized)
          store.set('failedImport', null);
        update({ lastImport: Date.now(), error: null });
        console.log('[WhatsApp] Bild erfolgreich gespeichert');
        try {
          await acknowledge(message, store);
          console.log('[WhatsApp] Reaktion gesendet');
        } catch (error) {
          console.warn('[WhatsApp] Reaktion:', error.message);
          update({ reactionError: 'Bild gespeichert; die 👍-Reaktion wird erneut versucht.' });
        }
      }
    } catch (error) {
      store.set('failedImport', {
        id: message.id._serialized,
        groupId: message.fromMe ? message.to : message.from,
      });
      console.warn('[WhatsApp] Bildimport:', error.stack || error.message);
      if (active()) update({ error: `Bildimport: ${error.message.slice(0, 500)}` });
    }
  };
  const retryLastImport = async () => {
    if (!client || state.status !== 'ready') return;
    const current = generation,
      groupId = acceptsGroup(store.settings(), store.get('failedImport')?.groupId)
        ? store.get('failedImport').groupId
        : selectedGroupIds(store.settings())[0];
    if (!groupId) return;
    const failed = store.get('failedImport');
    let id = failed?.groupId === groupId ? failed.id : null;
    if (!id)
      id = await client.pupPage.evaluate(async (groupId) => {
        const chat = await window.WWebJS.getChat(groupId, { getAsModel: false });
        if (!chat) return null;
        let messages = chat.msgs?.getModelsArray() || [];
        if (!messages.some((msg) => msg.type === 'image')) {
          const loaded = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
          messages = [...(loaded || []), ...(chat.msgs?.getModelsArray() || [])];
        }
        const latest = messages
          .filter(
            (msg) => msg.type === 'image' && !msg.isViewOnce && msg.t > Date.now() / 1000 - 3600,
          )
          .sort((a, b) => b.t - a.t)[0];
        if (!latest) return null;
        const raw = latest.id;
        if (raw._serialized) return raw._serialized;
        const native = raw.toString();
        if (/^(true|false)_/.test(native)) return native;
        const participant =
          typeof raw.participant === 'string' ? raw.participant : raw.participant?._serialized;
        return `${raw.fromMe}_${groupId}_${raw.id}${participant ? `_${participant}` : ''}`;
      }, groupId);
    if (!id) {
      update({
        error:
          'Kein Bild zum erneuten Import gefunden. Bitte das Foto noch einmal in die gewählte Gruppe senden.',
      });
      return;
    }
    const message = await client.getMessageById(id);
    if (!message) {
      update({ error: 'Bildnachricht nicht mehr verfügbar. Bitte erneut senden.' });
      return;
    }
    normalizeMessageId(message);
    importQueue = importQueue.then(() =>
      processImage(message, () => current === generation && !closed),
    );
    await importQueue;
  };
  const recoverImages = async () => {
    if (
      recoveryBusy ||
      closed ||
      !client ||
      state.status !== 'ready' ||
      !store.settings().whatsappEnabled
    )
      return;
    const current = generation,
      session = client;
    recoveryBusy = true;
    try {
      for (const groupId of selectedGroupIds(store.settings())) {
        const active = () =>
          current === generation &&
          !closed &&
          store.settings().whatsappEnabled &&
          acceptsGroup(store.settings(), groupId);
        if (!active()) continue;
        try {
          const ids = await recentImageIds(session, groupId, Date.now() - 48 * 3600000);
          for (const id of ids) {
            if (!active()) break;
            if (store.db.prepare('SELECT 1 FROM receipts WHERE message_id=?').get(id)) continue;
            const message = await session.getMessageById(id);
            if (!message) continue;
            importQueue = importQueue
              .then(() => (active() ? processImage(message, active) : null))
              .catch((e) => console.warn('[WhatsApp] Nachimport:', e.message));
            await importQueue;
          }
        } catch (e) {
          if (active())
            console.warn('[WhatsApp] Nachimport einer Gruppe nicht abgeschlossen:', e.message);
        }
      }
    } finally {
      recoveryBusy = false;
    }
  };
  const reconnect = () => {
    if (!closed && store.settings().whatsappEnabled && !retry) {
      retry = setTimeout(() => {
        retry = null;
        start().catch(() => {});
      }, 30_000);
      retry.unref();
    }
  };
  const start = async () => {
    if (closed || ['connecting', 'qr', 'authenticated', 'ready'].includes(state.status)) return;
    const current = ++generation;
    update({ status: 'connecting', qr: null, error: null, groups: [] });
    try {
      await retireWhatsAppClient(client);
      const { default: wwebjs } = await import('whatsapp-web.js');
      if (current !== generation) return;
      client = new wwebjs.Client({
        authStrategy: new wwebjs.LocalAuth({ dataPath: path.join(dataDir, 'whatsapp') }),
        webVersionCache: { type: 'local', path: path.join(dataDir, 'whatsapp-cache') },
        deviceName: organization(store).whatsappDeviceName,
        puppeteer: {
          headless: true,
          ...(process.env.PUPPETEER_EXECUTABLE_PATH
            ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
            : {}),
          args:
            process.env.CHROMIUM_NO_SANDBOX === 'true'
              ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
              : ['--disable-dev-shm-usage'],
        },
      });
      const active = () => current === generation && !closed;
      client.on('qr', async (qr) => {
        const image = await QRCode.toDataURL(qr, { margin: 2, width: 300 });
        if (active()) update({ status: 'qr', qr: image, error: null });
      });
      client.on('authenticated', () => {
        if (active()) update({ status: 'authenticated', qr: null });
      });
      client.on('ready', async () => {
        if (!active()) return;
        try {
          await installMessageCompatibility(client);
        } catch (error) {
          console.warn('[WhatsApp] Kompatibilitätsadapter:', error.message);
        }
        if (!active()) return;
        update({ status: 'ready', qr: null, error: null });
        retryReactions();
        await refreshGroups();
        await recoverImages();
        for (const row of store.db
          .prepare(
            "SELECT id,message_id,sender FROM items WHERE source='whatsapp' AND (sender='' OR body='') LIMIT 100",
          )
          .all()) {
          if (!active()) break;
          try {
            const message = await client.getMessageById(row.message_id);
            const caption = message?.body || message?.rawData?.caption || message?._data?.caption;
            if (caption && active())
              store.db
                .prepare("UPDATE items SET body=? WHERE id=? AND body=''")
                .run(String(caption).slice(0, 1200), row.id);
            if (row.sender) continue;
            let name = message?.rawData?.notifyName || message?._data?.notifyName || '';
            if (!name && message) {
              const contact = await message.getContact();
              name = contact.pushname || contact.name || '';
            }
            if (name && active())
              store.db
                .prepare('UPDATE items SET sender=? WHERE id=?')
                .run(String(name).slice(0, 160), row.id);
          } catch {
            /* Older messages or contact names may no longer be available. */
          }
        }
        if (store.get('retryLatestImport')) {
          store.set('retryLatestImport', false);
          await retryLastImport().catch((error) =>
            console.warn('[WhatsApp] Importwiederholung:', error.message),
          );
        }
      });
      client.on('auth_failure', () => {
        if (active()) {
          update({
            status: 'error',
            qr: null,
            error: 'Anmeldung fehlgeschlagen. Bitte die Sitzung zurücksetzen und erneut koppeln.',
          });
        }
      });
      client.on('disconnected', () => {
        if (active()) {
          update({
            status: 'disconnected',
            qr: null,
            groups: [],
            error: 'Verbindung unterbrochen. Ein neuer Versuch erfolgt in 30 Sekunden.',
          });
          reconnect();
        }
      });
      client.on('message_create', (message) => {
        if (!active()) return;
        const settings = store.settings();
        const chatId = message.fromMe ? message.to : message.from;
        if (
          !settings.whatsappEnabled ||
          !selectedGroupIds(settings).length ||
          !acceptsGroup(settings, chatId) ||
          !message.hasMedia ||
          message.type !== 'image' ||
          message.isViewOnce
        )
          return;
        importQueue = importQueue
          .then(() => processImage(message, active))
          .catch((error) => console.warn('[WhatsApp] Importwarteschlange:', error.message));
      });
      client.on('message_reaction', (reaction) => {
        if (!active()) return;
        importQueue = importQueue
          .then(async () => {
            if (!active()) return;
            if (rotateByReaction(reaction, store, active)) {
              media.changed?.();
              console.log('[WhatsApp] Bild per Reaktion gedreht');
            }
            if (approveByReaction(reaction, store))
              console.log('[WhatsApp] KI-Sperre per ✅ freigegeben');
            if (await deleteByReaction(reaction, store, media, active)) {
              console.log('[WhatsApp] Bild per ❌-Reaktion gelöscht');
            }
          })
          .catch((error) => {
            console.warn('[WhatsApp] Bildaktion per Reaktion:', error.message);
            if (active())
              update({
                error:
                  'Bildaktion konnte nicht ausgeführt werden. Bitte im Adminbereich bearbeiten oder die Reaktion erneut setzen.',
              });
          });
      });
      client.on('message_edit', (message, newBody) => {
        if (!active()) return;
        importQueue = importQueue
          .then(async () => {
            if (!active()) return;
            if (updateImageCaption(message, newBody, store))
              console.log('[WhatsApp] Bildtext aktualisiert');
            else if (typeof newBody === 'string' && message.type === 'image' && message.hasMedia) {
              message.body = newBody;
              await processImage(message, active);
            }
          })
          .catch((error) => console.warn('[WhatsApp] Bildtextänderung:', error.message));
      });
      await client.initialize();
    } catch (error) {
      if (current === generation) {
        console.warn(
          '[WhatsApp] Startfehler:',
          String(error.message || error)
            .replace(/https?:\/\/\S+/g, '[URL]')
            .slice(0, 800),
        );
        if (
          /browser is already running|Failed to launch the browser process/i.test(
            String(error.message),
          )
        ) {
          await retireProfileBrowser(path.join(dataDir, 'whatsapp', 'session'));
        }
        update({
          status: 'error',
          qr: null,
          error:
            'WhatsApp konnte nicht gestartet werden. Chromium-Installation und Serververbindung prüfen.',
        });
        reconnect();
      }
    }
  };
  const stop = async (logout = false) => {
    ++generation;
    clearTimeout(retry);
    retry = null;
    const old = client;
    client = null;
    update({ status: 'disconnected', qr: null, groups: [], error: null });
    if (old) {
      if (logout) await old.logout().catch(() => {});
      await retireWhatsAppClient(old);
    }
  };
  return {
    state: () => ({
      ...state,
      canRetryImport: acceptsGroup(store.settings(), store.get('failedImport')?.groupId),
      pendingReactions: store.db
        .prepare(
          'SELECT COUNT(*) AS n FROM receipts WHERE reacted=0 AND group_id IN (SELECT value FROM json_each(?))',
        )
        .get(selectedGroupsSql(store.settings())).n,
    }),
    start,
    stop,
    refreshGroups,
    retryLastImport,
    recoverImages,
    close: async () => {
      closed = true;
      clearInterval(reactionTimer);
      clearInterval(groupsTimer);
      await stop();
      await importQueue;
    },
  };
}
