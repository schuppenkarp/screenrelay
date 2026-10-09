import { cloneTemplate, fillForm } from './templates.js';
import { applyAppearance } from './appearance.js';

export async function mountOrganizationSettings(container, api, json, toast, onSaved) {
  const settings = await api('/api/organization');
  if (!container.isConnected) return;
  const panel = document.createElement('section');
  panel.className = 'panel organization-panel';
  panel.replaceChildren(cloneTemplate('organization-settings'));
  fillForm(panel.querySelector('form'), settings);
  for (const image of panel.querySelectorAll('[data-brand-preview]'))
    image.src = settings[image.dataset.brandPreview];
  container.prepend(panel);
  const form = panel.querySelector('form'),
    status = panel.querySelector('[role=status]');
  const saveResult = async (value) => {
    applyAppearance(value);
    await onSaved();
    toast('Organisation gespeichert.');
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(form));
      await saveResult(await api('/api/organization', json('PUT', values)));
    } catch (e) {
      status.textContent = e.message;
    }
  };
  for (const button of panel.querySelectorAll('[data-preset]'))
    button.onclick = async () => {
      try {
        await saveResult(
          await api(
            '/api/organization/preset',
            json('POST', { preset: button.dataset.preset, preserveCalendar: true }),
          ),
        );
      } catch (e) {
        status.textContent = e.message;
      }
    };
  for (const input of panel.querySelectorAll('[data-image]'))
    input.onchange = async () => {
      if (!input.files[0]) return;
      try {
        const body = new FormData();
        body.append('image', input.files[0]);
        await saveResult(
          await api('/api/organization/images/' + input.dataset.image, { method: 'POST', body }),
        );
      } catch (e) {
        status.textContent = e.message;
      }
    };
}
