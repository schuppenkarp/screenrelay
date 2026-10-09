import { cloneTemplate, fillForm, setText } from './templates.js';
export function mountWallSettings(container, data, api, json, toast, onSaved, section = 'layout') {
  const settings = data.settings,
    panel = document.createElement('section');
  panel.className = 'panel wall-settings';
  panel.replaceChildren(cloneTemplate('wall-settings'));
  const fields = panel.querySelector('form');
  fillForm(fields, settings);
  for (const selector of ['[data-section-title]', '[data-save-title]'])
    setText(panel, selector, section === 'touch' ? 'Touch-Ansicht' : 'Layout');
  const selection = panel.querySelector('[data-touch-items]');
  for (const item of data.items.filter((item) => item.pinned && item.visible)) {
    const label = document.createElement('label');
    label.className = 'check-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'touchItemIds';
    input.value = item.id;
    input.checked = settings.touchItemIds.includes(item.id);
    label.append(
      input,
      document.createTextNode(
        item.title +
          ' · ' +
          (item.type === 'stream' ? 'Kamera' : item.type === 'text' ? 'Infotafel' : 'Foto') +
          (item.rotation_visible === false ? ' · nur Touch' : ''),
      ),
    );
    selection.append(label);
  }
  if (!selection.childElementCount)
    selection.textContent =
      'Noch keine aktiven Fixinhalte vorhanden. Zuerst Kameras oder Bilder hinzufügen und fixieren.';
  container.append(panel);
  for (const group of panel.querySelectorAll('[data-section]'))
    if (group.dataset.section !== section) group.remove();
  const form = panel.querySelector('form'),
    preview = panel.querySelector('.layout-preview');
  const draw = () => {
    if (!preview) return;
    const columns = Math.max(1, Math.min(4, Number(form.elements.layoutColumns.value) || 2)),
      rows = Math.max(1, Math.min(3, Number(form.elements.layoutRows.value) || 2));
    preview.style.gridTemplateColumns =
      columns === 2
        ? `${Number(form.elements.layoutLeftPercent.value) || 50}fr ${100 - (Number(form.elements.layoutLeftPercent.value) || 50)}fr`
        : `repeat(${columns},1fr)`;
    preview.style.gridTemplateRows = `repeat(${rows},1fr)`;
    preview.replaceChildren();
    for (let index = 0; index < columns * rows; index++) {
      const tile = document.createElement('span'),
        position = form.elements.noticePosition.value,
        row = Math.floor(index / columns),
        column = index % columns;
      const notice =
        position !== 'off' &&
        row === (position.startsWith('bottom') ? rows - 1 : 0) &&
        column === (position.endsWith('right') ? columns - 1 : 0);
      tile.textContent = notice ? 'Info' : 'Foto / Fix';
      tile.classList.toggle('notice-cell', notice);
      preview.append(tile);
    }
  };
  form.addEventListener('input', draw);
  draw();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (section === 'touch') values.touchItemIds = new FormData(form).getAll('touchItemIds');
    for (const key of [
      'layoutColumns',
      'layoutRows',
      'layoutGap',
      'layoutPadding',
      'layoutLeftPercent',
      'touchDuration',
      'touchColumns',
    ])
      if (key in values) values[key] = Number(values[key]);
    for (const key of ['touchEnabled', 'portraitFeature'])
      if (form.elements[key]) values[key] = form.elements[key].checked;
    try {
      await api('/api/settings', json('PUT', values));
      await onSaved();
      toast(section === 'touch' ? 'Touch-Ansicht gespeichert.' : 'Layout gespeichert.');
    } catch (error) {
      form.querySelector('[role=status]').textContent = error.message;
    }
  };
}
