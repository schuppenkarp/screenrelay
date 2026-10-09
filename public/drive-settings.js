import { cloneTemplate } from './templates.js';
import { formatDate } from './appearance.js';
export async function mountDriveSettings(container, api, json, toast) {
  const panel = document.createElement('section');
  panel.className = 'panel account-panel';
  panel.replaceChildren(cloneTemplate('drive-settings'));
  container.append(panel);
  const form = panel.querySelector('form'),
    status = panel.querySelector('[role=status]');
  const show = (s) => {
    form.elements.enabled.checked = s.enabled;
    form.elements.cacheOnly.checked = s.cacheOnly;
    panel.querySelector('[data-callback]').textContent =
      s.redirectURI || panel.querySelector('[data-callback]').textContent;
    status.textContent = `${s.connected ? 'Verbunden' : s.configured ? 'Zugangsdaten hinterlegt · noch nicht verbunden' : 'Noch nicht eingerichtet'} · ${s.enabled ? 'Speicherung aktiv' : 'Speicherung pausiert'} · ${s.assets} gesicherte Dateien${s.running ? ' · Übertragung läuft' : ''}${s.lastSync ? ' · Letzte vollständige Synchronisierung: ' + formatDate(s.lastSync) : ''}${s.error ? ' · ' + s.error : ''}`;
    const link = panel.querySelector('[data-folder]');
    link.hidden = !s.root;
    if (s.root) link.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(s.root);
  };
  const run = async (action) => {
    try {
      await action();
    } catch (e) {
      status.textContent = e.message;
    }
  };
  await run(async () => show(await api('/api/drive')));
  form.onsubmit = (event) => {
    event.preventDefault();
    void run(async () => {
      show(
        await api(
          '/api/drive',
          json('PUT', {
            clientId: form.elements.clientId.value.trim(),
            clientSecret: form.elements.clientSecret.value.trim(),
            enabled: form.elements.enabled.checked,
            cacheOnly: form.elements.cacheOnly.checked,
          }),
        ),
      );
      form.elements.clientSecret.value = '';
      toast('Drive-Einstellungen gespeichert.');
    });
  };
  panel.querySelector('[data-connect]').onclick = () =>
    run(async () => {
      const s = await api('/api/drive/connect', json('POST', {}));
      location.assign(s.url);
    });
  panel.querySelector('[data-sync]').onclick = () =>
    run(async () => {
      show(await api('/api/drive/sync', json('POST', {})));
      toast('Drive-Synchronisierung gestartet.');
    });
  panel.querySelector('[data-disconnect]').onclick = () =>
    run(async () => {
      show(await api('/api/drive/disconnect', json('POST', {})));
      toast('Drive-Verbindung getrennt.');
    });
  const timer = setInterval(() => {
    if (!panel.isConnected) {
      clearInterval(timer);
      return;
    }
    void run(async () => show(await api('/api/drive')));
  }, 10000);
}
