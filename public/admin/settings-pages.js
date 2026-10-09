import { mountEntraSettings } from '../entra-settings.js';
import { cloneTemplate, setText } from '../templates.js';
import { $, toast, heading } from './ui.js';
import { json } from './api.js';
import { mountOrganizationSettings } from '../organization-settings.js';
import { mountCalendarSettings } from '../calendar-settings.js';
import { mountDriveSettings } from '../drive-settings.js';
import { mountAISettings } from '../ai-settings.js';
import { mountWallSettings } from '../wall-settings.js';

export function createSettingsPages({ api, getData, getPage, refresh, shell }) {
  function settingsHost(title, description) {
    const host = document.createElement('div');
    host.id = 'settings-page-content';
    $('#content').replaceChildren(heading('EINSTELLUNGEN', title, description), host);
    return $('#settings-page-content');
  }
  function layoutPage() {
    const section = getPage() === 'touch' ? 'touch' : 'layout';
    mountWallSettings(
      settingsHost(
        section === 'touch' ? 'Touch-Ansicht' : 'Layout',
        section === 'touch'
          ? 'Kameraansicht bei Berührung: Inhalte, Raster und Rückkehrzeit.'
          : 'Bildschirmfelder, Abstände und Infotafelposition.',
      ),
      getData(),
      api,
      json,
      toast,
      async () => {
        await refresh();
        if (getPage() === section) layoutPage();
      },
      section,
    );
  }
  function organizationPage() {
    void mountOrganizationSettings(
      settingsHost('Organisation', 'Markenauftritt, Kontaktdaten und regionale Einstellungen.'),
      api,
      json,
      toast,
      async () => {
        await refresh();
        if (getPage() === 'organization') shell();
      },
    ).catch((error) => toast(error.message, true));
  }
  function calendarPage() {
    void mountCalendarSettings(
      settingsHost('Kalender', 'Terminquelle, Aktualisierung und Anzeige.'),
      api,
      json,
      toast,
    ).catch((error) => toast(error.message, true));
  }
  function aiPage() {
    void mountAISettings(
      settingsHost('KI-Bildprüfung', 'Automatische Prüfung und Freigabe neuer Fotos.'),
      api,
      json,
      toast,
    );
  }
  function drivePage() {
    void mountDriveSettings(
      settingsHost('Google Drive', 'Bildarchiv, Synchronisierung und lokaler Cache.'),
      api,
      json,
      toast,
    );
  }
  function accessPage() {
    const host = settingsHost('Zugang & Speicher', 'Adminzugang und Speicherbelegung.');
    host.replaceChildren(cloneTemplate('storage-panel'));
    setText(host, '[data-storage-used]', (getData().storage.used / 1024 / 1024).toFixed(1));
    setText(host, '[data-storage-max]', Math.round(getData().storage.max / 1024 / 1024));
    void mountEntraSettings(host, api, json, toast).catch((error) => toast(error.message, true));
    $('#change-password').onclick = () => {
      const dialog = $('#editor');
      dialog.replaceChildren(cloneTemplate('password-editor'));
      $('#cancel-password').onclick = () => dialog.close();
      $('#password-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api(
            '/api/password',
            json('POST', Object.fromEntries(new FormData(event.currentTarget))),
          );
          dialog.close();
          toast('Passwort geändert. Andere Adminsitzungen wurden abgemeldet.');
        } catch (error) {
          $('#password-error').textContent = error.message;
        }
      };
      dialog.showModal();
    };
  }

  return { layoutPage, organizationPage, calendarPage, aiPage, drivePage, accessPage };
}
