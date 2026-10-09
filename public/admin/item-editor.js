import { cloneTemplate, fillForm } from '../templates.js';
import { $, $$, toast, guarded } from './ui.js';
import { json } from './api.js';
import { editNotice } from '../notice-editor.js';
import { editStream } from '../stream-editor.js';

export function createItemEditors({ api, refresh, render }) {
  function openStreamEditor(item) {
    editStream($('#editor'), item, async (payload) => {
      if (payload === null) await api(`/api/items/${item.id}`, { method: 'DELETE' });
      else
        await api(
          item ? `/api/items/${item.id}` : '/api/items/stream',
          json(item ? 'PATCH' : 'POST', payload),
        );
      await refresh();
      render();
      toast(payload === null ? 'Kamera entfernt.' : 'Kamera gespeichert.');
    });
  }
  function openEditor(item) {
    if (item?.type === 'stream') return openStreamEditor(item);
    if (!item || item.type === 'text')
      return editNotice($('#editor'), item, async (payload) => {
        await api(
          item ? `/api/items/${item.id}` : '/api/items/text',
          json(item ? 'PATCH' : 'POST', payload),
        );
        await refresh();
        render();
        toast('Infotafel gespeichert.');
      });
    const dialog = $('#editor');
    dialog.replaceChildren(cloneTemplate('photo-editor'));
    fillForm($('#item-form'), item);
    $('.editor-image', dialog).src = item.url;
    $$('.close-dialog', dialog).forEach((button) => (button.onclick = () => dialog.close()));
    $('#item-form').onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const payload = {
        ...values,
        pinned: values.pinned === 'on',
        visible: values.visible === 'on',
        duration: values.duration === '' ? null : Number(values.duration),
        sort_order: Number(values.sort_order),
      };
      const button = $('[type="submit"]', dialog);
      button.disabled = true;
      try {
        await api(
          item ? `/api/items/${item.id}` : '/api/items/text',
          json(item ? 'PATCH' : 'POST', payload),
        );
        dialog.close();
        await refresh();
        render();
        toast('Inhalt gespeichert.');
      } catch (error) {
        $('#editor-error').textContent = error.message;
        button.disabled = false;
      }
    };
    if (item)
      $('#delete-item').onclick = guarded(async () => {
        if (
          !confirm(
            `„${item.title}“ aus der Bilderwand entfernen und im lokalen deleted-Ordner archivieren?`,
          )
        )
          return;
        await api(`/api/items/${item.id}`, { method: 'DELETE' });
        dialog.close();
        await refresh();
        render();
        toast('Inhalt gelöscht.');
      });
    dialog.showModal();
  }

  return { openEditor, openStreamEditor };
}
