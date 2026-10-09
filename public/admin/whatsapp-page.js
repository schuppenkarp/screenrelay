import { groupPatternEditor } from './group-pattern-editor.js';
import { cloneTemplate, setText } from '../templates.js';
import { $, toast, guarded, heading, statusLabels } from './ui.js';
import { json } from './api.js';
import { formatDate } from '../appearance.js';

export function createWhatsAppPage({ api, getData, refresh }) {
  function renderConnection(connection, settings) {
    const host = $('#content');
    host.querySelector('.dot').classList.toggle('green', connection.status === 'ready');
    setText(host, '[data-connection-status]', statusLabels[connection.status]);
    host.querySelector('.qr-area').hidden = !connection.qr;
    if (connection.qr) host.querySelector('.qr-area img').src = connection.qr;
    host.querySelector('.connection-placeholder').hidden = Boolean(connection.qr);
    setText(
      host,
      '[data-connection-title]',
      connection.status === 'ready'
        ? 'Euer Account ist verbunden.'
        : ['connecting', 'authenticated'].includes(connection.status)
          ? 'Einen Moment bitte …'
          : 'Bereit für eure Momente.',
    );
    setText(
      host,
      '[data-connection-hint]',
      connection.status === 'ready'
        ? 'Wähle rechts die Gruppen für eure Bilderwand.'
        : 'Nach dem Start erscheint hier der QR-Code.',
    );
    for (const [selector, value] of [
      ['[data-connection-error]', connection.error],
      ['[data-groups-error]', connection.groupsError],
      ['[data-reaction-error]', connection.reactionError],
      [
        '[data-pending-reactions]',
        connection.pendingReactions
          ? connection.pendingReactions +
            ' 👍-Reaktion(en) noch ausständig. Automatischer erneuter Versuch.'
          : '',
      ],
    ]) {
      setText(host, selector, value);
      host.querySelector(selector).hidden = !value;
    }
    if (!connection.canRetryImport) $('#retry-import').remove();
    $('#wa-start').disabled = ['connecting', 'qr', 'authenticated', 'ready'].includes(
      connection.status,
    );
    $('#wa-stop').disabled = !settings.whatsappEnabled;
    $('#refresh-groups').disabled = connection.status !== 'ready' || connection.groupsLoading;
    setText(
      host,
      '[data-group-count]',
      connection.groupsLoading
        ? 'Gruppen werden geladen …'
        : connection.groups.length + ' Gruppen verfügbar',
    );
    setText(host, '[data-moderation-label]', settings.moderation ? ' nach deiner Freigabe' : '');
    setText(
      host,
      '[data-last-import]',
      connection.lastImport
        ? 'Letzter Import: ' + formatDate(connection.lastImport)
        : 'Noch kein Foto in dieser Sitzung importiert.',
    );
  }
  function renderGroups(connection, settings) {
    const savedGroups =
      settings.groups ||
      (settings.groupId ? [{ id: settings.groupId, name: settings.groupName }] : []);
    const groups = new Map(
      [...savedGroups, ...connection.groups].map((group) => [group.id, group]),
    );
    const selected = settings.groupIds || (settings.groupId ? [settings.groupId] : []);
    const host = $('[data-group-list]');
    for (const group of groups.values()) {
      const row = cloneTemplate('whatsapp-group');
      const rule = settings.groupRules?.[group.id];
      row.querySelector('[data-allow-pin]').checked = Boolean(rule?.allowPin);
      const checkbox = row.querySelector('[name=groupIds]');
      checkbox.value = group.id;
      checkbox.checked = selected.includes(group.id);
      setText(row, '[data-group-name]', group.name);
      row.querySelector('[data-group-rule]').dataset.groupRule = group.id;
      row.querySelector('[data-import-mode]').value = rule?.mode || 'all';
      row.querySelector('[data-import-tag]').value = rule?.hashtag || '#bilderwand';
      row.querySelector('[data-caption-mode]').value =
        rule?.captionMode || (rule?.mode === 'hashtag' ? 'none' : 'full');
      host.append(row);
    }
    if (!groups.size)
      host.textContent =
        'Noch keine Gruppen geladen. Bitte WhatsApp verbinden und Gruppen aktualisieren.';
  }
  function whatsappPage() {
    const connection = getData().whatsapp,
      settings = getData().settings;
    $('#content').replaceChildren(
      heading(
        'VON DER GRUPPE AUF DEN BILDSCHIRM',
        'WhatsApp verbinden',
        'Neue Fotos kommen automatisch an. Ein 👍 bestätigt die Übernahme.',
      ),
      cloneTemplate('whatsapp-page'),
    );
    renderConnection(connection, settings);
    renderGroups(connection, settings);
    const readPatterns = groupPatternEditor($('#group-form'), settings, connection.groups);
    for (const action of ['start', 'stop', 'reset'])
      $(`#wa-${action}`).onclick = guarded(async (event) => {
        if (
          action === 'reset' &&
          !confirm(
            'WhatsApp-Sitzung entfernen? Danach ist ein neuer QR-Scan nötig. Gespeicherte Bilder bleiben erhalten.',
          )
        )
          return;
        event.currentTarget.disabled = true;
        await api(`/api/whatsapp/${action}`, json('POST'));
        await refresh();
        whatsappPage();
      });
    if ($('#retry-import'))
      $('#retry-import').onclick = guarded(async (event) => {
        event.currentTarget.disabled = true;
        await api('/api/whatsapp/import/retry', json('POST'));
        await refresh();
        whatsappPage();
      });
    $('#refresh-groups').onclick = guarded(async (event) => {
      event.currentTarget.disabled = true;
      await api('/api/whatsapp/groups/refresh', json('POST'));
      await refresh();
      whatsappPage();
    });
    $('#group-form').onsubmit = guarded(async (event) => {
      event.preventDefault();
      await api(
        '/api/whatsapp/group',
        json('PUT', {
          groupPatterns: readPatterns(),
          groupIds: new FormData(event.currentTarget).getAll('groupIds'),
          groupRules: Object.fromEntries(
            [...event.currentTarget.querySelectorAll('[data-group-rule]')].map((row) => [
              row.dataset.groupRule,
              {
                mode: row.querySelector('[data-import-mode]').value,
                hashtag: row.querySelector('[data-import-tag]').value.trim(),
                captionMode: row.querySelector('[data-caption-mode]').value,
                allowPin: row.querySelector('[data-allow-pin]').checked,
              },
            ]),
          ),
        }),
      );
      await refresh();
      whatsappPage();
      toast('Gruppenauswahl gespeichert. Alle ausgewählten Gruppen werden berücksichtigt.');
    });
  }

  return whatsappPage;
}
