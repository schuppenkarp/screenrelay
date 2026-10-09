import { createEntraUserPicker } from './entra-user-picker.js';
import { cloneTemplate } from './templates.js';

export async function mountEntraSettings(host, api, json, toast) {
  const root = document.createElement('div');
  root.replaceChildren(cloneTemplate('entra-settings'));
  host.append(root);
  const form = root.querySelector('form'),
    status = root.querySelector('[data-entra-status]');
  let settings;
  const picker = createEntraUserPicker(root, api);
  function callback() {
    root.querySelector('[data-entra-callback]').value =
      form.elements.origin.value.replace(/\/$/, '') + '/api/auth/entra/callback';
  }
  function fill() {
    for (const name of ['tenantId', 'clientId', 'origin'])
      form.elements[name].value = settings[name] || (name === 'origin' ? location.origin : '');
    form.elements.enabled.checked = settings.enabled;
    form.elements.clientSecret.value = '';
    form.elements.clearSecret.checked = false;
    root.querySelector('[data-secret-status]').textContent = settings.secretSet
      ? 'Geheimnis gespeichert. Leer lassen, um es beizubehalten.'
      : 'Noch kein Geheimnis gespeichert.';
    picker.reset(settings.users);
    status.textContent = settings.enabled
      ? 'Microsoft-Anmeldung aktiviert.'
      : 'Microsoft-Anmeldung deaktiviert. Masterzugang ist verfügbar.';
    callback();
  }
  try {
    settings = await api('/api/entra');
    if (!root.isConnected) return;
    root.querySelector('[data-entra-identity]').textContent =
      'Angemeldet als ' + settings.user.name;
    if (!settings.canManage) {
      status.textContent =
        'Zum Verwalten der Microsoft-Zugänge bitte abmelden und mit dem Masterkennwort anmelden.';
      host.querySelector('#change-password').hidden = true;
      return;
    }
    form.hidden = false;
    fill();
  } catch (error) {
    status.textContent = error.message;
    return;
  }
  form.elements.origin.oninput = callback;
  async function save(connectionOnly = false) {
    if (!form.reportValidity()) return;
    const button = connectionOnly
        ? root.querySelector('[data-entra-save-connection]')
        : form.querySelector('[type=submit]'),
      error = root.querySelector('[data-entra-error]');
    button.disabled = true;
    error.textContent = '';
    const values = Object.fromEntries(new FormData(form));
    values.enabled = form.elements.enabled.checked;
    values.clearSecret = form.elements.clearSecret.checked;
    values.users = connectionOnly ? settings.users : picker.values();
    if (connectionOnly) values.enabled = settings.enabled;
    const setupDraft = !settings.enabled && values.users.length === 0;
    if (setupDraft) values.enabled = false;
    const selected = picker.values();
    try {
      settings = await api('/api/entra', json('PUT', values));
      fill();
      if (connectionOnly) picker.reset(selected);
      if (setupDraft) {
        status.textContent =
          'Verbindung gespeichert. Jetzt Benutzer auswählen, anschließend die Microsoft-Anmeldung aktivieren und speichern.';
        toast('Verbindung gespeichert – Benutzer können jetzt gesucht werden.');
      } else toast('Microsoft-Zugang gespeichert.');
      if (connectionOnly || setupDraft) root.querySelector('[data-entra-search-button]').click();
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      button.disabled = false;
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    void save();
  };
  root.querySelector('[data-entra-save-connection]').onclick = () => {
    void save(true);
  };
  root.querySelector('[data-entra-check]').onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = 'Microsoft-Mandant wird geprüft …';
    try {
      status.textContent = (await api('/api/entra/check', json('POST', {}))).message;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
