import { cloneTemplate } from '../templates.js';
import { matchesGroupName } from '../group-patterns.js';

export function groupPatternEditor(form, settings, groups) {
  const host = form.querySelector('[data-pattern-list]');
  const read = () =>
    [...host.querySelectorAll('[data-pattern-row]')].map((row) => ({
      pattern: row.querySelector('[data-pattern-name]').value.trim(),
      hashtag: row.querySelector('[data-pattern-tag]').value.trim(),
      captionMode: row.querySelector('[data-pattern-caption]').value,
      allowPin: row.querySelector('[data-pattern-pin]').checked,
    }));
  function describe(rule) {
    if (!rule) return 'Kein Import: weder Einzelregel noch passende Namensregel.';
    const tag = rule.hashtag || '(Basis-Hashtag fehlt)';
    const normal =
      rule.mode === 'all'
        ? 'Alle Fotos → normale Bilder.'
        : `${tag} → normales Bild. Ohne passenden Hashtag kein Import.`;
    return `${normal} ${rule.allowPin ? `${tag}#fix → Fixinhalt.` : `Fixierung ausgeschaltet: ${tag}#fix bleibt ein normales Bild.`} Groß-/Kleinschreibung egal.`;
  }
  function preview() {
    const manual = new Set(new FormData(form).getAll('groupIds'));
    const patterns = read();
    for (const row of host.querySelectorAll('[data-pattern-row]')) {
      row.querySelector('[data-pattern-summary]').textContent = describe({
        mode: 'hashtag',
        hashtag: row.querySelector('[data-pattern-tag]').value.trim(),
        allowPin: row.querySelector('[data-pattern-pin]').checked,
      });
    }
    for (const card of form.querySelectorAll('[data-group-card]')) {
      const checkbox = card.querySelector('[name=groupIds]');
      const group = groups.find((entry) => entry.id === checkbox.value);
      const fields = card.querySelector('[data-group-rule]');
      fields.hidden = !checkbox.checked;
      const rule = checkbox.checked
        ? {
            mode: fields.querySelector('[data-import-mode]').value,
            hashtag: fields.querySelector('[data-import-tag]').value.trim(),
            allowPin: fields.querySelector('[data-allow-pin]').checked,
          }
        : patterns.find(
            (entry) => group && entry.pattern && matchesGroupName(group.name, entry.pattern),
          );
      const source = checkbox.checked
        ? 'Aktiv: Einzelregel (hat Vorrang). '
        : rule
          ? `Aktiv: Namensregel ${rule.pattern}. `
          : '';
      card.querySelector('[data-effective-rule]').textContent =
        source + describe(rule ? { mode: 'hashtag', ...rule } : null);
    }
    const matches = groups.filter(
      (group) =>
        !manual.has(group.id) &&
        patterns.some((rule) => rule.pattern && matchesGroupName(group.name, rule.pattern)),
    );
    form.querySelector('[data-pattern-preview]').textContent = matches.length
      ? `Automatisch erfasst (${matches.length}): ${matches.map((group) => group.name).join(', ')}`
      : 'Aktuell keine zusätzlichen Gruppen durch Namensregeln erfasst.';
  }
  function add(rule = {}) {
    const fragment = cloneTemplate('whatsapp-pattern');
    const row = fragment.querySelector('[data-pattern-row]');
    row.querySelector('[data-pattern-pin]').checked = Boolean(rule.allowPin);
    row.querySelector('[data-pattern-name]').value = rule.pattern || '';
    row.querySelector('[data-pattern-tag]').value = rule.hashtag || '#bilderwand';
    row.querySelector('[data-pattern-caption]').value = rule.captionMode || 'removeHashtag';
    row.querySelector('[data-pattern-remove]').onclick = () => {
      row.remove();
      preview();
    };
    host.append(fragment);
    preview();
  }
  for (const rule of settings.groupPatterns || []) add(rule);
  form.querySelector('#add-group-pattern').onclick = () => add();
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  preview();
  return read;
}
