import ical from 'node-ical';

export function upcomingEvents(parsed, now = Date.now()) {
  return Object.values(parsed)
    .filter(
      (event) =>
        event.type === 'VEVENT' &&
        event.status !== 'CANCELLED' &&
        event.start instanceof Date &&
        event.start.getTime() >= now,
    )
    .sort((a, b) => a.start - b.start)
    .map((event) => ({
      title: String(event.summary || 'Termin'),
      start: event.start.toISOString(),
      allDay: event.datetype === 'date',
    }));
}

export function calendarService(getSettings, request = fetch) {
  let parsed = {},
    checked = 0,
    updated = null,
    pending = null,
    failed = false,
    errorMessage = '';
  let signature = '';
  async function refresh({ force = false } = {}) {
    const settings = getSettings();
    const current = JSON.stringify([settings.calendarEnabled, settings.calendarUrl]);
    if (current !== signature) {
      signature = current;
      parsed = {};
      checked = 0;
      updated = null;
      failed = false;
      errorMessage = '';
    }
    if (!settings.calendarEnabled || !settings.calendarUrl) return;
    if (pending) {
      await pending;
      // A changed source may have arrived while the previous request was running.
      if (!checked) await refresh();
      return;
    }
    if (!force && Date.now() - checked < settings.calendarRefreshSeconds * 1000) return;
    checked = Date.now();
    pending = (async () => {
      try {
        const response = await request(settings.calendarUrl, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Kein iCalendar');
        const result = await ical.async.parseICS(text);
        if (signature === current) {
          parsed = result;
          updated = Date.now();
          failed = false;
          errorMessage = '';
        }
      } catch (error) {
        if (signature === current) {
          failed = true;
          errorMessage = /^HTTP \d{3}$/.test(error.message)
            ? `Kalenderquelle antwortet mit ${error.message}.`
            : error.message === 'Kein iCalendar'
              ? 'Die Quelle liefert keinen iCalendar-Kalender.'
              : 'Kalender konnte nicht geladen werden. Adresse und Erreichbarkeit prüfen.';
        }
        console.warn('[Kalender]', error.message);
      } finally {
        pending = null;
      }
    })();
    await pending;
  }
  void refresh();
  return {
    refresh,
    state() {
      void refresh();
      return { events: upcomingEvents(parsed), updated, failed, checked, error: errorMessage };
    },
  };
}
