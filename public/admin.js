import { createUpdatesPage } from './admin/updates-page.js';
import { cloneTemplate, setText, loadTemplates } from './templates.js';
import { appearance, loadAppearance, applyAppearance } from './appearance.js';
import { $, $$, guarded, statusLabels } from './admin/ui.js';
import { createApi, json } from './admin/api.js';
import { createAuthPage } from './admin/auth-page.js';
import { createLibraryPage } from './admin/library-page.js';
import { createPlaybackPage } from './admin/playback-page.js';
import { createSettingsPages } from './admin/settings-pages.js';
import { createMonitorPage } from './admin/monitor-page.js';
import { createWhatsAppPage } from './admin/whatsapp-page.js';

let data, timer;
let page = 'library';
const getData = () => data;
const getPage = () => page;
const api = createApi(async () => {
  if (!data) return;
  data = null;
  clearInterval(timer);
  await boot();
});
const authPage = createAuthPage({ api, boot });
const { libraryPage, releasePreviews, resetSearch } = createLibraryPage({
  api,
  getData,
  getPage,
  refresh,
  render,
  navigate,
  removeItem(id) {
    data.items = data.items.filter((item) => item.id !== id);
  },
});
const settingsPage = createPlaybackPage({ api, getData, getPage, refresh, render });
const { layoutPage, organizationPage, calendarPage, aiPage, drivePage, accessPage } =
  createSettingsPages({ api, getData, getPage, refresh, shell });
const updatesPage = createUpdatesPage({ api });
const displayPage = createMonitorPage({ api, getData });
const whatsappPage = createWhatsAppPage({ api, getData, refresh });

function navigate(nextPage) {
  page = nextPage;
  resetSearch();
  render();
}

async function boot() {
  releasePreviews(true);
  try {
    await loadTemplates();
    await loadAppearance();
    const session = await api('/api/session');
    if (session.role === 'admin') {
      await refresh();
      shell();
      clearInterval(timer);
      timer = setInterval(poll, 5000);
    } else authPage(session);
  } catch (error) {
    // This fallback must work even when the HTML templates could not be downloaded.
    const host = document.createElement('section');
    host.className = 'auth-card';
    const title = document.createElement('h1');
    title.textContent = 'Verbindung unterbrochen';
    const message = document.createElement('p');
    message.textContent = error.message;
    const retry = document.createElement('button');
    retry.textContent = 'Erneut versuchen';
    retry.onclick = boot;
    host.append(title, message, retry);
    $('#app').replaceChildren(host);
  }
}
async function refresh() {
  data = await api('/api/admin/state');
  applyAppearance(data.organization);
}
function shell() {
  $('#app').replaceChildren(cloneTemplate('admin-shell'));
  applyAppearance(appearance);
  $$('[data-page]').forEach(
    (button) =>
      (button.onclick = () => {
        navigate(button.dataset.page);
        window.scrollTo({ top: 0 });
      }),
  );
  $('#logout').onclick = guarded(async () => {
    await api('/api/logout', json('POST'));
    data = null;
    clearInterval(timer);
    await boot();
  });
  render();
}
function render() {
  if (page !== 'pins') releasePreviews(true);
  $$('[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
    button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
  });
  $('#breadcrumb').textContent = {
    library: 'WhatsApp-Bilder',
    pins: 'Fixierte Inhalte',
    display: 'Monitor',
    whatsapp: 'WhatsApp',
    settings: 'Wiedergabe',
    layout: 'Layout',
    touch: 'Touch-Ansicht',
    retention: 'Foto-Lebensdauer',
    organization: 'Organisation',
    calendar: 'Kalender',
    ai: 'KI-Bildprüfung',
    drive: 'Google Drive',
    access: 'Zugang & Speicher',
    updates: 'Updates',
  }[page];
  sidebarStatus();
  ({
    library: libraryPage,
    pins: libraryPage,
    display: displayPage,
    whatsapp: whatsappPage,
    settings: settingsPage,
    retention: settingsPage,
    layout: layoutPage,
    touch: layoutPage,
    organization: organizationPage,
    calendar: calendarPage,
    ai: aiPage,
    drive: drivePage,
    access: accessPage,
    updates: updatesPage,
  })[page]();
}
function sidebarStatus() {
  $('#sidebar-connection').replaceChildren(cloneTemplate('sidebar-status'));
  $('#sidebar-connection .dot').classList.toggle('green', data.whatsapp.status === 'ready');
  setText($('#sidebar-connection'), '[data-status-label]', statusLabels[data.whatsapp.status]);
}
async function poll() {
  if (!data || document.hidden) return;
  try {
    const previous = JSON.stringify(data.items),
      previousStatus = JSON.stringify(data.whatsapp);
    await refresh();
    if (!data) return;
    sidebarStatus();
    if (
      (page === 'library' || page === 'pins') &&
      previous !== JSON.stringify(data.items) &&
      !$('#editor').open
    )
      libraryPage();
    if (
      page === 'whatsapp' &&
      previousStatus !== JSON.stringify(data.whatsapp) &&
      !$('select:focus') &&
      !$('#editor').open
    )
      whatsappPage();
  } catch {
    /* Keep the current UI during a temporary disconnect. */
  }
}

boot();
