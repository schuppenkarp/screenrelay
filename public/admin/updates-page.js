import { cloneTemplate } from '../templates.js';
import { $, guarded, heading } from './ui.js';
export function createUpdatesPage({ api }) {
  return async function updatesPage() {
    $('#content').replaceChildren(
      heading('SYSTEM', 'Updates', 'Stabile Versionen und Versionshinweise.'),
      cloneTemplate('updates-page'),
    );
    const host = $('#updates-panel');
    const load = guarded(async () => {
      const state = await api('/api/updates');
      if (!host.isConnected) return;
      $('[data-installed]', host).textContent = state.installed;
      $('[data-latest]', host).textContent =
        state.release?.version || 'Noch keine Veröffentlichung verfügbar';
      $('[data-release-notes]', host).textContent = state.release?.notes || '';
      $('[data-update-status]', host).textContent =
        state.error ||
        (state.updateAvailable
          ? 'Eine neue Version ist verfügbar. UPDATE.cmd am Server starten.'
          : 'Du verwendest die aktuelle Version.');
    });
    $('[data-check-update]', host).onclick = load;
    await load();
  };
}
