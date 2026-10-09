import { cloneTemplate, fillForm, setText } from './templates.js';
export function editStream(dialog, item, save) {
  dialog.classList.remove('notice-editor');
  dialog.replaceChildren(cloneTemplate('stream-editor'));
  fillForm(
    dialog.querySelector('form'),
    item || { pinned: true, visible: true, rotation_visible: true },
  );
  setText(dialog, '[data-editor-title]', item ? 'Kamera bearbeiten' : 'Webcam hinzufügen');
  dialog.querySelector('[name=stream_password]').placeholder = item?.stream_password_set
    ? 'Gespeichert · leer lassen zum Beibehalten'
    : 'Kamerapasswort';
  if (!item) dialog.querySelector('[data-delete]').remove();
  for (const button of dialog.querySelectorAll('[data-close]'))
    button.onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form));
    for (const key of ['pinned', 'visible', 'rotation_visible', 'clear_stream_password'])
      values[key] = form.elements[key].checked;
    values.duration = values.duration ? Number(values.duration) : null;
    const button = form.querySelector('.primary');
    button.disabled = true;
    try {
      await save(values);
      dialog.close();
    } catch (error) {
      form.querySelector('[role=status]').textContent = error.message;
      button.disabled = false;
    }
  };
  const remove = dialog.querySelector('[data-delete]');
  if (remove)
    remove.onclick = async () => {
      try {
        await save(null);
        dialog.close();
      } catch (error) {
        dialog.querySelector('[role=status]').textContent = error.message;
      }
    };
  dialog.showModal();
}
