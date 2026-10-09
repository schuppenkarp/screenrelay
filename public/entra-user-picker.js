import { cloneTemplate } from './templates.js';

/** Search and selection are separate from saving access permissions. */
export function createEntraUserPicker(root, api) {
  const input = root.querySelector('[data-entra-search]'),
    results = root.querySelector('[data-entra-results]'),
    status = root.querySelector('[data-entra-search-status]'),
    selected = root.querySelector('[data-entra-users]');
  let users = [],
    suggestions = [],
    generation = 0,
    timer;
  function renderResults() {
    results.replaceChildren();
    for (const user of suggestions) {
      const fragment = cloneTemplate('entra-user-suggestion');
      fragment.querySelector('[data-user-name]').textContent = user.label;
      fragment.querySelector('[data-user-email]').textContent = user.email;
      const button = fragment.querySelector('button'),
        alreadySelected = users.some((entry) => entry.oid === user.oid);
      button.disabled = alreadySelected;
      button.textContent = alreadySelected ? 'Ausgewählt' : 'Auswählen';
      button.onclick = () => {
        users.push(user);
        renderSelected();
        renderResults();
      };
      results.append(fragment);
    }
  }
  function renderSelected() {
    selected.replaceChildren();
    root.querySelector('[data-entra-selected-count]').textContent =
      `${users.length} Benutzer ausgewählt`;
    for (const user of users) {
      const fragment = cloneTemplate('entra-user');
      fragment.querySelector('[data-user-name]').textContent =
        user.label || 'Freigegebener Benutzer';
      fragment.querySelector('[data-user-email]').textContent = user.email || '';
      fragment.querySelector('[data-user-remove]').onclick = () => {
        users = users.filter((entry) => entry.oid !== user.oid);
        renderSelected();
        renderResults();
      };
      selected.append(fragment);
    }
  }
  async function search(version) {
    if (!root.isConnected) return;
    status.textContent = 'Benutzer werden gesucht …';
    try {
      const response = await api('/api/entra/users?q=' + encodeURIComponent(input.value.trim()));
      if (version !== generation || !root.isConnected) return;
      suggestions = response.users;
      renderResults();
      status.textContent = suggestions.length
        ? `${suggestions.length} Vorschläge${response.more ? ' – für weitere Treffer Suche eingrenzen' : ''}.`
        : 'Keine passenden Benutzer gefunden.';
    } catch (error) {
      if (version !== generation || !root.isConnected) return;
      suggestions = [];
      renderResults();
      status.textContent = error.message;
    }
  }
  input.oninput = () => {
    clearTimeout(timer);
    const version = ++generation;
    suggestions = [];
    renderResults();
    status.textContent = '';
    timer = setTimeout(() => search(version), 350);
  };
  input.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(timer);
      void search(++generation);
    }
  };
  root.querySelector('[data-entra-search-button]').onclick = () => {
    clearTimeout(timer);
    void search(++generation);
  };
  return {
    reset(value) {
      clearTimeout(timer);
      generation++;
      users = value.map((user) => ({ ...user }));
      suggestions = [];
      renderSelected();
      renderResults();
      status.textContent = 'Name oder E-Mail eingeben oder Vorschläge laden.';
    },
    values: () => users.map((user) => ({ ...user })),
  };
}
