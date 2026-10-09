import { cloneTemplate, setText } from '../templates.js';
import { $, toast, guarded, heading } from './ui.js';
import { json } from './api.js';

export function createMonitorPage({ api, getData }) {
  function displayPage() {
    $('#content').replaceChildren(
      heading(
        'DIE GROSSE BÜHNE',
        'Euer Monitor',
        'Ein Browser, ein Bildschirm – und euer Team ist live.',
      ),
      cloneTemplate('monitor-page'),
    );
    setText(
      $('#content'),
      '[data-active-count]',
      getData().items.filter((item) => item.visible && !item.expired).length,
    );
    const container = $('#monitor-access-list');
    async function copyLink(path) {
      const link = location.origin + path;
      try {
        await navigator.clipboard.writeText(link);
        toast('Vollständiger Monitor-Link kopiert.');
      } catch {
        const dialog = $('#editor');
        dialog.replaceChildren(cloneTemplate('monitor-link'));
        $('#manual-link').value = link;
        $('#close-link').onclick = () => dialog.close();
        dialog.showModal();
        $('#manual-link').select();
      }
    }
    async function loadAccess() {
      const rows = await api('/api/viewer-tokens');
      container.replaceChildren();
      if (!rows.length) container.textContent = 'Noch keine Monitor-Zugänge vorhanden.';
      for (const row of rows) {
        const fragment = cloneTemplate('monitor-access-row');
        setText(fragment, '[data-access-name]', row.name);
        $('[data-access-copy]', fragment).onclick = guarded(() => copyLink(row.path));
        $('[data-access-revoke]', fragment).onclick = guarded(async () => {
          if (!confirm(`Zugang „${row.name}“ sperren? Zugehörige Monitore werden getrennt.`))
            return;
          await api(`/api/viewer-tokens/${encodeURIComponent(row.id)}`, json('DELETE'));
          await loadAccess();
        });
        container.append(fragment);
      }
    }
    $('#monitor-access-form').onsubmit = guarded(async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = $('button', form);
      button.disabled = true;
      try {
        await api('/api/viewer-tokens', json('POST', { name: form.elements.name.value }));
        form.reset();
        await loadAccess();
        toast('Monitor-Zugang erstellt.');
      } finally {
        button.disabled = false;
      }
    });
    void loadAccess().catch((error) => toast(error.message, true));
  }

  return displayPage;
}
