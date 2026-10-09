export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const assert = (condition, message, status) => {
  if (!condition) throw new AppError(message, status);
};
export function integer(value, min, max, label) {
  assert(
    Number.isInteger(value) && value >= min && value <= max,
    `${label}: Bitte eine ganze Zahl zwischen ${min} und ${max} eingeben.`,
  );
  return value;
}
export function text(value, max, label, required = false) {
  assert(
    typeof value === 'string' && value.length <= max && (!required || value.trim()),
    `${label}: ${required ? 'Pflichtfeld, ' : ''}maximal ${max} Zeichen.`,
  );
  return value.trim();
}
export function choice(value, values, label) {
  assert(values.includes(value), `${label}: Ungültiger Wert.`);
  return value;
}
export function boolean(value, label) {
  assert(typeof value === 'boolean', `${label}: Ungültiger Wert.`);
  return value;
}
export function validateSettings(input, previous) {
  const next = { ...previous };
  for (const [key, min, max] of [
    ['layoutColumns', 1, 4],
    ['layoutRows', 1, 3],
    ['layoutGap', 0, 60],
    ['layoutPadding', 0, 60],
    ['layoutLeftPercent', 25, 75],
    ['touchDuration', 5, 3600],
    ['touchColumns', 1, 4],
  ]) {
    if (key in input) next[key] = integer(input[key], min, max, key);
  }
  if ('noticePosition' in input)
    next.noticePosition = choice(
      input.noticePosition,
      ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'off'],
      'Infotafelposition',
    );
  for (const key of ['portraitFeature', 'touchEnabled'])
    if (key in input) next[key] = boolean(input[key], key);
  if ('touchItemIds' in input) {
    assert(
      Array.isArray(input.touchItemIds) &&
        input.touchItemIds.length <= 12 &&
        input.touchItemIds.every((id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)),
      'Bitte höchstens 12 Fixinhalte auswählen.',
    );
    next.touchItemIds = [...new Set(input.touchItemIds)];
  }
  if ('maximumPhotos' in input)
    next.maximumPhotos = integer(input.maximumPhotos, 0, 10000, 'Maximalanzahl Fotos');
  if ('photosPerScreen' in input)
    next.photosPerScreen = choice(input.photosPerScreen, [1, 2, 4, 6], 'Fotos pro Bildschirm');
  if ('retentionDays' in input)
    next.retentionDays = integer(input.retentionDays, 0, 3650, 'Aufbewahrungszeit');
  if ('minimumPhotos' in input)
    next.minimumPhotos = integer(input.minimumPhotos, 0, 10000, 'Mindestanzahl Fotos');
  for (const key of ['photoDuration', 'pinDuration'])
    if (key in input) next[key] = integer(input[key], 2, 600, 'Anzeigedauer');
  if ('pinInterval' in input) next.pinInterval = integer(input.pinInterval, 1, 100, 'Fotoabstand');
  if ('transitionDuration' in input)
    next.transitionDuration = integer(input.transitionDuration, 0, 1500, 'Übergangsdauer');
  if ('transition' in input)
    next.transition = choice(
      input.transition,
      ['fade', 'slide', 'zoom', 'none', 'random'],
      'Übergang',
    );
  if ('fit' in input) next.fit = choice(input.fit, ['contain', 'cover'], 'Bildformat');
  for (const key of ['moderation', 'showCaptions'])
    if (key in input) next[key] = boolean(input[key], key);
  if ('title' in input) next.title = text(input.title, 80, 'Anzeigename', true);
  return next;
}
export function validateItem(input, previous = {}) {
  const next = {
    title: '',
    body: '',
    pinned: true,
    visible: true,
    duration: null,
    sort_order: 0,
    theme: 'forest',
    ...previous,
  };
  if ('title' in input) next.title = text(input.title, 120, 'Titel', true);
  if ('body' in input) next.body = text(input.body, 20000, 'Text');
  for (const key of ['pinned', 'visible', 'rotation_visible'])
    if (key in input) next[key] = boolean(input[key], key);
  if ('duration' in input)
    next.duration =
      input.duration === null ? null : integer(input.duration, 2, 600, 'Anzeigedauer');
  if ('sort_order' in input) next.sort_order = integer(input.sort_order, 0, 10000, 'Reihenfolge');
  if ('theme' in input)
    next.theme = choice(input.theme, ['forest', 'sand', 'night', 'plum'], 'Farbe');
  return next;
}
