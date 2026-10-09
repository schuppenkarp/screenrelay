import { assert, text, integer, choice, boolean } from './validation.js';

export const organizationDefaults = {
  name: 'ScreenRelay',
  subtitle: 'BILDER · INFORMATIONEN · TERMINE',
  website: '',
  email: '',
  phone: '',
  address: '',
  footer: 'Gemeinsam mehr zeigen.',
  emptyTitle: 'Willkommen auf unserer Bilderwand.',
  emptyMessage: 'Hier erscheinen Fotos und Informationen.',
  logo: '/assets/default-wordmark.svg',
  mark: '/assets/default-mark.svg',
  favicon: '/assets/default-mark.svg',
  fontFamily: 'Nunito',
  accentColor: '#ffde21',
  backgroundColor: '#000000',
  locale: 'de-AT',
  timeZone: 'Europe/Vienna',
  calendarEnabled: false,
  calendarUrl: '',
  calendarRefreshSeconds: 30,
  calendarMaxEvents: 8,
  calendarHeading: 'Die nächsten Termine',
  driveFolderName: 'ScreenRelay',
  whatsappDeviceName: 'ScreenRelay',
  aiContext: 'öffentlicher Informationsmonitor',
  aiHeldMessage: 'KI Inhaltserkennung hat ihr Bild temporär gesperrt',
};
export const neutralOrganization = organizationDefaults;
export function organization(store) {
  return { ...organizationDefaults, ...store.get('organization') };
}
export function publicAppearance(settings) {
  const { calendarUrl, aiContext, aiHeldMessage, ...appearance } = settings;
  return appearance;
}
export function validateOrganization(input, previous) {
  assert(
    input && typeof input === 'object' && !Array.isArray(input),
    'Ungültige Organisationseinstellungen.',
  );
  const next = { ...previous };
  for (const key of [
    'name',
    'subtitle',
    'website',
    'email',
    'phone',
    'address',
    'footer',
    'emptyTitle',
    'emptyMessage',
    'calendarHeading',
    'driveFolderName',
    'whatsappDeviceName',
    'aiContext',
    'aiHeldMessage',
  ]) {
    if (key in input)
      next[key] = text(
        input[key],
        key === 'aiContext' ? 500 : 250,
        key,
        [
          'name',
          'calendarHeading',
          'driveFolderName',
          'whatsappDeviceName',
          'aiContext',
          'aiHeldMessage',
        ].includes(key),
      );
  }
  for (const key of ['logo', 'mark', 'favicon'])
    if (key in input) {
      const value = text(input[key], 200, key);
      assert(
        /^\/(assets\/[a-zA-Z0-9_./-]+|branding\/[a-f0-9-]{36}\.png)$/.test(value) &&
          !value.includes('..'),
        'Bitte ein hochgeladenes oder mitgeliefertes Logo verwenden.',
      );
      next[key] = value;
    }
  for (const key of ['accentColor', 'backgroundColor'])
    if (key in input) {
      assert(
        /^#[a-fA-F0-9]{6}$/.test(input[key]),
        'Bitte einen sechsstelligen Farbwert verwenden.',
      );
      next[key] = input[key];
    }
  if ('fontFamily' in input)
    next.fontFamily = choice(
      input.fontFamily,
      ['Nunito', 'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New'],
      'Schriftart',
    );
  if ('locale' in input) {
    try {
      new Intl.DateTimeFormat(input.locale);
    } catch {
      assert(false, 'Ungültige Sprache/Region.');
    }
    next.locale = text(input.locale, 40, 'Region', true);
  }
  if ('timeZone' in input) {
    try {
      new Intl.DateTimeFormat('de', { timeZone: input.timeZone });
    } catch {
      assert(false, 'Ungültige Zeitzone.');
    }
    next.timeZone = text(input.timeZone, 80, 'Zeitzone', true);
  }
  if ('calendarUrl' in input) {
    next.calendarUrl = text(input.calendarUrl, 2000, 'Kalender-URL');
    if (next.calendarUrl) {
      let url;
      try {
        url = new URL(next.calendarUrl);
      } catch {
        assert(false, 'Ungültige Kalender-URL.');
      }
      assert(
        url.protocol === 'https:' && !url.username && !url.password,
        'Kalender-URL muss HTTPS ohne Benutzername/Passwort verwenden.',
      );
    }
  }
  if ('calendarEnabled' in input) next.calendarEnabled = boolean(input.calendarEnabled, 'Kalender');
  if ('calendarRefreshSeconds' in input)
    next.calendarRefreshSeconds = integer(
      input.calendarRefreshSeconds,
      15,
      3600,
      'Kalenderintervall',
    );
  if ('calendarMaxEvents' in input)
    next.calendarMaxEvents = integer(input.calendarMaxEvents, 1, 20, 'Maximale Termine');
  assert(
    !next.calendarEnabled || next.calendarUrl,
    'Für den Kalender bitte eine iCalendar-URL eintragen.',
  );
  return next;
}
