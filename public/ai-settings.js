import { cloneTemplate } from './templates.js';
export async function mountAISettings(container, api, json, toast) {
  const panel = document.createElement('section');
  panel.className = 'panel account-panel';
  panel.replaceChildren(cloneTemplate('ai-settings'));
  container.append(panel);
  const form = panel.querySelector('form'),
    status = panel.querySelector('[role=status]');
  const fields = form.elements;
  const updateProvider = () => {
    for (const section of panel.querySelectorAll('[data-provider]'))
      section.hidden = section.dataset.provider !== fields.provider.value;
  };
  fields.provider.onchange = updateProvider;
  updateProvider();
  const show = (s) => {
    fields.enabled.checked = s.enabled;
    fields.cropEnabled.checked = Boolean(s.cropEnabled);
    for (const field of ['provider', 'geminiModel', 'openrouterModel', 'threshold'])
      fields[field].value = s[field];
    panel.querySelector('[data-gemini-status]').textContent = s.geminiConfigured
      ? 'Gemini-Schlüssel hinterlegt'
      : 'Noch kein Gemini-Schlüssel';
    panel.querySelector('[data-openrouter-status]').textContent = s.openrouterConfigured
      ? 'OpenRouter-Schlüssel hinterlegt'
      : 'Noch kein OpenRouter-Schlüssel';
    updateProvider();
    status.textContent = `OpenAI: ${s.configured ? 'Schlüssel hinterlegt' : 'Noch kein Schlüssel'} · ${s.enabled ? 'Aktiv' : 'Inaktiv'} · ${s.pending} ausstehend${s.error ? ' · ' + s.error : ''}`;
  };
  const saveButton = form.querySelector('.primary');
  saveButton.disabled = true;
  try {
    show(await api('/api/ai'));
    saveButton.disabled = false;
  } catch (e) {
    status.textContent = e.message;
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      values.enabled = fields.enabled.checked;
      values.cropEnabled = fields.cropEnabled.checked;
      values.threshold = Number(values.threshold);
      for (const field of ['key', 'geminiKey', 'openrouterKey', 'geminiModel', 'openrouterModel'])
        values[field] = values[field].trim();
      show(await api('/api/ai', json('PUT', values)));
      for (const field of ['key', 'geminiKey', 'openrouterKey']) fields[field].value = '';
      toast('KI-Einstellungen gespeichert.');
    } catch (e) {
      status.textContent = e.message;
    } finally {
      saveButton.disabled = false;
    }
  };
  panel.querySelector('[data-review]').onclick = async () => {
    try {
      const state = await api('/api/ai/review', json('POST', {}));
      status.textContent = `${state.pending} Prüfungen ausstehend. Ergebnisse stehen in der Mediathek.`;
      toast('Bildprüfung gestartet.');
    } catch (e) {
      status.textContent = e.message;
    }
  };
}
