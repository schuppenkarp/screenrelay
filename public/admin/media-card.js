import { cloneTemplate, setText } from '../templates.js';
import { formatDate } from '../appearance.js';

export function createMediaCard(item, settings, items, pinsOnly) {
  const fragment = cloneTemplate('media-card');
  const card = fragment.querySelector('article');
  card.classList.toggle('is-hidden', !item.visible);
  for (const button of card.querySelectorAll('[data-edit]')) button.dataset.edit = item.id;
  if (item.type !== 'image') card.querySelector('[data-rotation-controls]').remove();
  else for (const button of card.querySelectorAll('[data-rotate]')) button.dataset.itemId = item.id;
  const preview = card.querySelector('[data-preview]');
  let content;
  if (item.type === 'image') {
    content = document.createElement('img');
    content.src = item.url;
    content.alt = item.title;
    content.loading = 'lazy';
  } else if (pinsOnly && item.visible) {
    content = document.createElement('span');
    content.className = 'camera-live-preview';
    content.dataset.cameraPreview = item.id;
    content.setAttribute('aria-label', 'Live-Vorschau ' + item.title);
  } else {
    content = cloneTemplate('camera-placeholder');
    setText(content, 'strong', item.title);
    setText(content, 'small', item.stream_kind.toUpperCase() + ' · Livekamera');
  }
  preview.replaceWith(content);
  card.querySelector('.card-preview').setAttribute('aria-label', item.title + ' bearbeiten');
  card.querySelector('.pin-badge').hidden = !item.pinned;
  const hidden = card.querySelector('.hidden-badge');
  hidden.hidden = item.visible && !item.expired;
  hidden.textContent = item.limited ? 'Anzeigelimit' : item.expired ? 'Abgelaufen' : 'Ausgeblendet';
  const remove = card.querySelector('[data-delete]');
  remove.dataset.delete = item.id;
  remove.setAttribute(
    'aria-label',
    (item.type === 'stream' ? 'Kamera' : 'Bild') + ' löschen: ' + item.title,
  );
  setText(card, 'h3', item.title);
  setText(
    card,
    '[data-source]',
    item.source === 'whatsapp'
      ? 'WhatsApp'
      : item.type === 'stream'
        ? item.rotation_visible === false
          ? 'Livekamera · nur Touch'
          : 'Livekamera'
        : 'Upload',
  );
  setText(
    card,
    '[data-duration]',
    (item.duration ?? (item.pinned ? settings.pinDuration : settings.photoDuration)) + ' Sek.',
  );
  const details = card.querySelector('[data-details]');
  if (item.type === 'image') details.replaceWith(imageDetails(item, settings, items));
  else details.remove();
  const pin = card.querySelector('[data-pin]');
  pin.dataset.pin = item.id;
  pin.title = item.pinned ? 'Fixierung lösen' : 'Fixieren';
  pin.setAttribute('aria-label', pin.title + ': ' + item.title);
  pin.classList.toggle('is-pinned', Boolean(item.pinned));
  const visibility = card.querySelector('[data-visible]');
  visibility.dataset.visible = item.id;
  visibility.textContent = item.visible ? 'Ausblenden' : 'Freigeben';
  return fragment;
}
function imageDetails(item, options, items) {
  const settings = options;
  let life = 'Unbegrenzt';
  if (item.pinned) life = 'Fixiert · bleibt erhalten';
  else if (item.source === 'whatsapp' && settings.retentionDays) {
    const remaining = item.created + settings.retentionDays * 86400000 - Date.now();
    const newest = items
      .filter((x) => x.visible && !x.pinned && x.type === 'image' && x.source === 'whatsapp')
      .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
      .slice(0, settings.minimumPhotos);
    const protectedPhoto = newest.some((x) => x.id === item.id);
    life =
      remaining > 0
        ? `Noch ${Math.ceil(remaining / 3600000)} Std. (${Math.ceil(remaining / 86400000)} Tage)`
        : 'Abgelaufen';
    if (protectedPhoto) life += ' · Mindestbestand schützt';
    if (!item.visible) life += ' · manuell ausgeblendet';
  }
  if (item.limited) life = 'Nicht angezeigt · Maximalanzahl erreicht';
  const [width, height] = [90, 270].includes(item.display_rotation)
    ? [item.height, item.width]
    : [item.width, item.height];
  const format =
    width && height
      ? `${width > height ? 'Querformat' : width < height ? 'Hochformat' : 'Quadratisch'} · ${width} × ${height}`
      : 'Format wird beim Anzeigen erkannt';

  const fragment = cloneTemplate('image-details');
  setText(fragment, '[data-import]', formatDate(item.created));
  setText(fragment, '[data-lifetime]', life);
  setText(
    fragment,
    '[data-sender]',
    item.sender || (item.source === 'whatsapp' ? 'Nicht verfügbar (Altimport)' : 'Admin-Upload'),
  );
  setText(fragment, '[data-orientation]', format);
  if (item.review) {
    const label = document.createElement('dt');
    label.textContent = 'KI-Prüfung';
    const value = document.createElement('dd');
    value.textContent =
      ({ held: '❓ Gesperrt', passed: '✓ Geprüft', approved: '✅ Manuell freigegeben' }[
        item.review.status
      ] || item.review.status) +
      ' · ' +
      item.review.reason;
    fragment.querySelector('dl').append(label, value);
  }
  return fragment;
}
