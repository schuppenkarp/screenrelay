import { cloneTemplate } from './templates.js';
export async function mountCalendarSettings(container, api, json, toast) {
  let settings = await api('/api/organization');
  if (!container.isConnected) return;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.replaceChildren(cloneTemplate('calendar-settings'));
  container.append(panel);
  const form = panel.querySelector('form');
  for (const key of [
    'calendarUrl',
    'calendarHeading',
    'calendarRefreshSeconds',
    'calendarMaxEvents',
  ])
    form.elements[key].value = settings[key];
  form.elements.calendarEnabled.checked = settings.calendarEnabled;
  const preview = panel.querySelector('.calendar-settings-preview');
  const checkButton = preview.querySelector('[data-calendar-check]');
  async function loadPreview(force = false) {
    checkButton.disabled = true;
    const status = preview.querySelector('[data-calendar-status]');
    status.textContent = 'Kalender wird geprüft …';
    status.dataset.state = 'loading';
    try {
      const state = await api(
        force ? '/api/calendar/refresh' : '/api/calendar',
        force ? json('POST', {}) : undefined,
      );
      if (!container.isConnected) return;
      const disabled = !settings.calendarEnabled;
      status.dataset.state = disabled ? 'disabled' : state.failed ? 'error' : 'ok';
      status.textContent = disabled
        ? 'Kalenderanzeige deaktiviert – die Quelle wird nicht abgerufen.'
        : state.failed
          ? `Kalender nicht erreichbar: ${state.error || 'Abruf fehlgeschlagen.'}${state.updated ? ' Vorschau zeigt zuletzt geladene Termine.' : ''}`
          : state.updated
            ? `Kalender erreichbar · ${state.events.length} kommende Termine geladen`
            : 'Noch keine Kalenderdaten geladen.';
      const dateFormat = new Intl.DateTimeFormat(settings.locale, {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: settings.timeZone,
      });
      preview.querySelector('[data-calendar-updated]').textContent = state.updated
        ? `Zuletzt erfolgreich geladen: ${dateFormat.format(new Date(state.updated))}`
        : '';
      preview.querySelector('[data-calendar-heading]').textContent = settings.calendarHeading;
      const list = preview.querySelector('[data-calendar-events]');
      list.replaceChildren();
      for (const event of state.events.slice(0, settings.calendarMaxEvents)) {
        const row = document.createElement('li');
        const time = document.createElement('time');
        time.dateTime = event.start;
        time.textContent = event.allDay
          ? new Intl.DateTimeFormat(settings.locale, {
              dateStyle: 'short',
              timeZone: 'UTC',
            }).format(new Date(event.start)) + ' · ganztägig'
          : dateFormat.format(new Date(event.start));
        const title = document.createElement('strong');
        title.textContent = event.title;
        row.append(time, title);
        list.append(row);
      }
      if (!state.events.length) {
        const empty = document.createElement('li');
        empty.textContent = disabled
          ? 'Keine Vorschau bei deaktiviertem Kalender.'
          : state.failed
            ? 'Keine Termine für die Vorschau verfügbar.'
            : 'Keine kommenden Termine vorhanden.';
        list.append(empty);
      }
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent = `Kalenderprüfung fehlgeschlagen: ${error.message}`;
    } finally {
      checkButton.disabled = false;
    }
  }
  checkButton.onclick = () => loadPreview(true);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      values.calendarEnabled = form.elements.calendarEnabled.checked;
      for (const key of ['calendarRefreshSeconds', 'calendarMaxEvents'])
        values[key] = Number(values[key]);
      settings = await api('/api/organization', json('PUT', values));
      form.querySelector('[role=status]').textContent = '';
      toast('Kalender gespeichert.');
      await loadPreview();
    } catch (error) {
      panel.querySelector('[role=status]').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  await loadPreview();
}
