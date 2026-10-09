import { icon } from './icons.js';

const templates = new Map();
let loading;
// Templates are trusted application files. User data is assigned through DOM properties only.
export function loadTemplates() {
  if (!loading)
    loading = loadAll().catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}
async function loadAll() {
  const names = [
    'updates-page',
    'admin',
    'admin-auth-page',
    'admin-item-editor',
    'admin-library-page',
    'admin-monitor-page',
    'admin-playback-page',
    'admin-settings-pages',
    'admin-ui',
    'admin-whatsapp-page',
    'ai-settings',
    'calendar-settings',
    'drive-settings',
    'entra-settings',
    'notice-editor',
    'organization-settings',
    'reolink-editor',
    'stream-editor',
    'wall-settings',
  ];
  const documents = await Promise.all(
    names.map(async (name) => {
      const response = await fetch(`/templates/${name}.html`);
      if (!response.ok) throw new Error(`Ansicht konnte nicht geladen werden: ${name}`);
      return new DOMParser().parseFromString(await response.text(), 'text/html');
    }),
  );
  const loaded = new Map();
  for (const document of documents)
    for (const template of document.querySelectorAll('template[id]')) {
      if (loaded.has(template.id)) throw new Error(`Doppelte Vorlage: ${template.id}`);
      loaded.set(template.id, template);
    }
  for (const [id, template] of loaded) templates.set(id, template);
}
export function cloneTemplate(id) {
  const template = templates.get(id);
  if (!template) throw new Error(`Unbekannte Vorlage: ${id}`);
  const fragment = template.content.cloneNode(true);
  for (const placeholder of fragment.querySelectorAll('[data-icon]')) {
    const svg = document.createElement('template');
    svg.innerHTML = icon(placeholder.dataset.icon);
    placeholder.replaceWith(svg.content);
  }
  return fragment;
}
export function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Fehlendes Textelement: ${selector}`);
  element.textContent = value ?? '';
}
export function fillForm(form, values) {
  for (const element of form.elements) {
    if (!element.name || !(element.name in values) || element.type === 'file') continue;
    if (element.type === 'checkbox') element.checked = Boolean(values[element.name]);
    else element.value = values[element.name] ?? '';
  }
}
