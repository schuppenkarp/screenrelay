import { cloneTemplate, setText } from './templates.js';

export function editReolink(dialog, items, api, onSaved) {
  dialog.classList.remove('notice-editor');
  dialog.classList.add('reolink-editor');
  const recorders = [
    ...new Map(
      items
        .filter((item) => item.type === 'stream' && item.stream_kind === 'reolink')
        .map((item) => [new URL(item.stream_url).origin + item.stream_username, item]),
    ).values(),
  ];
  dialog.replaceChildren(cloneTemplate('reolink-editor'));
  if (!recorders.length) dialog.querySelector('[data-saved-recorder]').remove();
  else
    for (const item of recorders)
      dialog
        .querySelector('[name=saved]')
        .add(new Option(`${new URL(item.stream_url).origin} · ${item.stream_username}`, item.id));
  const form = dialog.querySelector('form'),
    results = form.querySelector('.reolink-results'),
    list = form.querySelector('.reolink-channels'),
    message = form.querySelector('[role=status]'),
    add = form.querySelector('[data-import]');
  let discoveryId = null;
  const fields = ['address', 'username', 'password', 'saved']
    .map((name) => form.elements[name])
    .filter(Boolean);
  const busy = (value) => {
    for (const field of fields) field.disabled = value;
    form.querySelector('[data-load]').disabled = value;
  };
  const selected = () =>
    [...list.querySelectorAll('input:checked')].map((input) => Number(input.value));
  const count = () => {
    const length = selected().length;
    form.querySelector('[data-count]').textContent =
      `${length} Kamera${length === 1 ? '' : 's'} ausgewählt`;
    add.disabled = !length;
  };
  const reset = () => {
    discoveryId = null;
    results.hidden = true;
    message.textContent = '';
  };
  for (const field of fields) field.addEventListener('input', reset);
  if (form.elements.saved)
    form.elements.saved.onchange = () => {
      const saved = recorders.find((item) => item.id === form.elements.saved.value);
      form.elements.address.value = saved ? new URL(saved.stream_url).origin : '';
      form.elements.username.value = saved?.stream_username || 'admin';
      form.elements.password.value = '';
      form.elements.password.placeholder = saved
        ? 'Gespeichertes Passwort verwenden'
        : 'Kamerapasswort';
      reset();
    };
  form.onsubmit = async (event) => {
    event.preventDefault();
    reset();
    busy(true);
    message.textContent = 'Kamerakanäle werden geladen …';
    try {
      const response = await api('/api/reolink/channels', {
        method: 'POST',
        body: JSON.stringify({
          address: form.elements.address.value,
          username: form.elements.username.value,
          password: form.elements.password.value,
          existingItemId: form.elements.saved?.value || undefined,
        }),
      });
      discoveryId = response.discoveryId;
      list.replaceChildren(
        ...response.channels.map((channel) => {
          const row = cloneTemplate('reolink-channel');
          const checkbox = row.querySelector('input');
          checkbox.value = channel.channel;
          checkbox.dataset.online = String(channel.online);
          checkbox.disabled = Boolean(channel.existing);
          setText(row, '[data-channel-name]', channel.name);
          setText(row, '[data-channel-number]', channel.channel + 1);
          setText(row, '[data-channel-status]', channel.online ? 'Verbunden' : 'Offline');
          setText(row, '[data-channel-existing]', channel.existing ? ' · bereits vorhanden' : '');
          return row;
        }),
      );
      results.hidden = false;
      message.textContent = '';
      count();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      busy(false);
    }
  };
  list.onchange = count;
  form.querySelector('[data-all]').onclick = () => {
    list
      .querySelectorAll('input:not(:disabled)')
      .forEach((input) => (input.checked = input.dataset.online === 'true'));
    count();
  };
  form.querySelector('[data-none]').onclick = () => {
    list.querySelectorAll('input').forEach((input) => (input.checked = false));
    count();
  };
  add.onclick = async () => {
    if (!discoveryId) return;
    add.disabled = true;
    busy(true);
    message.textContent = 'Kameras werden angelegt …';
    try {
      const response = await api('/api/reolink/import', {
        method: 'POST',
        body: JSON.stringify({
          discoveryId,
          channels: selected(),
          rotation_visible: form.elements.rotation.checked,
          addToTouch: form.elements.touch.checked,
        }),
      });
      form.elements.password.value = '';
      await onSaved(response);
      dialog.close();
    } catch (error) {
      message.textContent = error.message;
      count();
    } finally {
      busy(false);
    }
  };
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener(
    'close',
    () => {
      form.elements.password.value = '';
      dialog.classList.remove('reolink-editor');
    },
    { once: true },
  );
  dialog.showModal();
}
