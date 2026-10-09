export let appearance = {
  name: 'Bilderwand',
  subtitle: 'BILDERWAND',
  footer: 'Gemeinsam mehr zeigen.',
  logo: '/assets/default-wordmark.svg',
  mark: '/assets/default-mark.svg',
  favicon: '/assets/default-mark.svg',
  fontFamily: 'Nunito',
  accentColor: '#ffde21',
  backgroundColor: '#000000',
  locale: 'de-AT',
  timeZone: 'Europe/Vienna',
  calendarHeading: 'Die nächsten Termine',
  calendarMaxEvents: 8,
};
export function applyAppearance(value) {
  appearance = { ...appearance, ...value };
  document.title = appearance.name + ' · Bilderwand';
  document.documentElement.style.setProperty('--brand-yellow', appearance.accentColor);
  const rgb = appearance.accentColor.match(/[a-f0-9]{2}/gi).map((v) => parseInt(v, 16));
  document.documentElement.style.setProperty(
    '--accent-ink',
    (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 140 ? '#121212' : '#ffffff',
  );
  document.documentElement.style.setProperty('--wall-background', appearance.backgroundColor);
  document.documentElement.style.setProperty('--brand-font', appearance.fontFamily);
  const icon = document.querySelector('link[rel=icon]');
  if (icon) icon.href = appearance.favicon;
  for (const image of document.querySelectorAll('[data-brand-logo]')) {
    image.src = appearance.logo;
    image.alt = appearance.name;
  }
  for (const image of document.querySelectorAll('[data-brand-mark]')) {
    image.src = appearance.mark;
    image.alt = appearance.name;
  }
  for (const text of document.querySelectorAll('[data-brand-name]'))
    text.textContent = appearance.name;
  for (const text of document.querySelectorAll('[data-brand-subtitle]'))
    text.textContent = appearance.subtitle;
  for (const text of document.querySelectorAll('[data-brand-footer]'))
    text.textContent = appearance.footer;
  const emptyTitle = document.querySelector('#empty h1');
  if (emptyTitle)
    emptyTitle.textContent = appearance.emptyTitle || 'Willkommen auf unserer Bilderwand.';
}
export async function loadAppearance() {
  const response = await fetch('/api/appearance');
  if (response.ok) applyAppearance(await response.json());
  return appearance;
}
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString(appearance.locale, { timeZone: appearance.timeZone });
}
