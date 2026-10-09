import { createMediaCard } from './media-card.js';
import { cloneTemplate, setText } from '../templates.js';
import { $, $$, toast, guarded, heading } from './ui.js';
import { json } from './api.js';

import { editReolink } from '../reolink-editor.js';
import { streamPool } from '../stream-pool.js';
import { createItemEditors } from './item-editor.js';

export function createLibraryPage({
  api,
  getData,
  getPage,
  refresh,
  render,
  navigate,
  removeItem,
}) {
  const { openEditor, openStreamEditor } = createItemEditors({ api, refresh, render });
  let filter = 'all',
    query = '';
  let previewReleases = [];
  function releasePreviews(clear = false) {
    for (const release of previewReleases) release();
    previewReleases = [];
    if (clear) streamPool.clear();
  }
  function libraryPage() {
    releasePreviews();
    const pinsOnly = getPage() === 'pins',
      items = getData().items.filter((item) =>
        pinsOnly
          ? item.type === 'stream' || (item.type === 'image' && item.pinned)
          : item.type === 'image' && !item.pinned,
      );
    if (!pinsOnly && filter === 'stream') filter = 'all';
    const host = $('#content');
    host.replaceChildren(
      heading(
        pinsOnly ? 'WAS BLEIBEN SOLL' : 'EURE MOMENTE, AN EINEM ORT',
        pinsOnly ? 'Fixierte Inhalte' : 'WhatsApp-Bilder',
        pinsOnly
          ? 'Fixierte Bilder und Kameras für eure Anzeige.'
          : 'Fotos aus eurer WhatsApp-Gruppe und zusätzlich hochgeladene Bilder.',
        cloneTemplate('library-actions'),
      ),
      cloneTemplate('library-overview'),
      cloneTemplate(
        getData().whatsapp.status === 'ready' ? 'library-connected' : 'library-disconnected',
      ),
      cloneTemplate('library-list'),
    );
    setText(
      host,
      '[data-photo-count]',
      items.filter((item) => item.type === 'image' && Boolean(item.pinned) === pinsOnly).length,
    );
    setText(host, '[data-photo-label]', pinsOnly ? 'fixierte Fotos' : 'in eurer Bildersammlung');
    setText(host, '[data-pin-count]', items.filter((item) => item.pinned).length);
    $('[data-pin-count]', host).closest('.stat').hidden = !pinsOnly;
    setText(
      host,
      '[data-active-count]',
      items.filter((item) => item.visible && !item.expired && item.rotation_visible !== false)
        .length,
    );
    setText(host, '[data-duration]', getData().settings.photoDuration);
    if ($('[data-group-name]', host))
      setText(
        host,
        '[data-group-name]',
        getData().settings.groupName || 'WhatsApp verbunden – bitte Gruppe auswählen',
      );
    setText(
      host,
      '[data-library-hint]',
      pinsOnly
        ? 'Fixierte Inhalte teilen sich ein Bildschirmfeld. Für die Touch-Ansicht wählst du sie in den Einstellungen aus. Ihre Anzeigedauer kannst du einzeln festlegen.'
        : 'Mit dem Pinnsymbol verschiebst du ein Foto zu „Fixierte Inhalte“. Kameras und Infotafel verwaltest du dort.',
    );
    $('#search').value = query;
    const filters = pinsOnly
      ? [
          ['all', 'Alle Inhalte'],
          ['image', 'Fotos'],
          ['stream', 'Kameras'],
          ['hidden', 'Ausgeblendet'],
        ]
      : [
          ['all', 'Alle Bilder'],
          ['hidden', 'Ausgeblendet'],
        ];
    for (const [id, label] of filters) {
      const button = document.createElement('button');
      button.dataset.filter = id;
      button.textContent = label;
      button.classList.toggle('selected', filter === id);
      $('.tabs', host).append(button);
    }
    if (!pinsOnly) for (const id of ['new-text', 'new-stream', 'new-reolink']) $('#' + id).remove();
    if (pinsOnly) {
      $('#new-text').onclick = () =>
        openEditor(getData().items.find((item) => item.type === 'text'));
      $('#new-stream').onclick = () => openStreamEditor();
      $('#new-reolink').onclick = () =>
        editReolink($('#editor'), getData().items, api, async (result) => {
          await refresh();
          render();
          toast(
            `${result.created} Kamera(s) hinzugefügt${result.existing ? ` · ${result.existing} bereits vorhanden` : ''}.`,
          );
        });
    }
    $('#upload').onclick = () => $('#files').click();
    $('#files').onchange = guarded(async (event) => {
      const files = [...event.target.files];
      if (!files.length) return;
      const button = $('#upload');
      button.disabled = true;
      let succeeded = 0,
        errors = [];
      for (const file of files) {
        button.textContent = `${succeeded + errors.length + 1} / ${files.length} hochladen …`;
        try {
          const body = new FormData();
          body.append('image', file);
          body.append('pinned', String(pinsOnly));
          await api('/api/items/upload', { method: 'POST', body });
          succeeded++;
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }
      await refresh();
      libraryPage();
      toast(
        `${succeeded} Bild${succeeded === 1 ? '' : 'er'} hochgeladen.${errors.length ? ` ${errors.join(' ')}` : ''}`,
        errors.length > 0,
      );
    });
    if ($('#connect-shortcut'))
      $('#connect-shortcut').onclick = () => {
        navigate('whatsapp');
      };
    $$('[data-filter]').forEach(
      (button) =>
        (button.onclick = () => {
          filter = button.dataset.filter;
          libraryPage();
        }),
    );
    $('#search').oninput = (event) => {
      query = event.target.value;
      renderItems();
    };
    renderItems();
  }
  function renderItems() {
    releasePreviews();
    const items = getData().items.filter(
      (item) =>
        ['image', 'stream'].includes(item.type) &&
        (getPage() === 'pins'
          ? item.pinned || item.type === 'stream'
          : item.type === 'image' && !item.pinned) &&
        (filter === 'all' ||
          (filter === 'hidden' ? !item.visible || item.expired : item.type === filter)) &&
        `${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase()),
    );
    if (getPage() === 'library') items.sort((a, b) => b.created - a.created);
    const grid = $('#items-grid');
    grid.replaceChildren(
      ...items.map((item) =>
        createMediaCard(item, getData().settings, getData().items, getPage() === 'pins'),
      ),
    );
    if (!items.length) {
      grid.append(cloneTemplate('library-empty'));
      setText(
        grid,
        'h2',
        query || filter !== 'all'
          ? 'Keine passenden Inhalte'
          : getPage() === 'pins'
            ? 'Das darf bleiben.'
            : 'Hier beginnt eure Bilderwand.',
      );
      setText(
        grid,
        'p',
        query || filter !== 'all'
          ? 'Probiere einen anderen Suchbegriff oder Filter.'
          : getPage() === 'pins'
            ? 'Fixiere ein Foto oder eine Kamera. Sie werden regelmäßig zwischen den Gruppenfotos gezeigt.'
            : 'Lade die ersten Bilder hoch oder verbinde eure WhatsApp-Gruppe. Neue Momente finden dann von selbst hierher.',
      );
    }
    const previewItems =
      getPage() === 'pins' ? items.filter((item) => item.type === 'stream' && item.visible) : [];
    streamPool.sync(previewItems);
    for (const item of previewItems) {
      const target = $(`[data-camera-preview="${item.id}"]`);
      if (target) previewReleases.push(streamPool.mount(target, item, { fit: 'contain' }));
    }
    $$('[data-rotate]').forEach((button) => {
      button.onclick = guarded(async () => {
        button.disabled = true;
        try {
          await api(
            `/api/items/${button.dataset.itemId}/rotate`,
            json('POST', { direction: button.dataset.rotate }),
          );
          await refresh();
          renderItems();
        } finally {
          button.disabled = false;
        }
      });
    });
    $$('[data-edit]').forEach(
      (button) =>
        (button.onclick = () =>
          openEditor(getData().items.find((item) => item.id === button.dataset.edit))),
    );
    $$('[data-delete]').forEach(
      (button) =>
        (button.onclick = guarded(async () => {
          button.disabled = true;
          try {
            await api(`/api/items/${button.dataset.delete}`, { method: 'DELETE' });
            removeItem(button.dataset.delete);
            libraryPage();
            toast('Inhalt archiviert.');
          } finally {
            button.disabled = false;
          }
        })),
    );
    for (const [selector, key, field] of [
      ['[data-pin]', 'pin', 'pinned'],
      ['[data-visible]', 'visible', 'visible'],
    ])
      $$(selector).forEach(
        (button) =>
          (button.onclick = guarded(async () => {
            const item = getData().items.find((item) => item.id === button.dataset[key]);
            await api(`/api/items/${item.id}`, json('PATCH', { [field]: !item[field] }));
            await refresh();
            libraryPage();
          })),
      );
  }

  return {
    libraryPage,
    releasePreviews,
    resetSearch: () => {
      query = '';
    },
  };
}
