import { createSlides } from './display/slides.js';
import { appearance, loadAppearance, applyAppearance } from './appearance.js';
import { createAdaptiveScheduler, pageDelay } from './player-core.js';
import { wallLayout, itemsForZone, portraitPair } from './wall-layout.js';
import { streamPool } from './stream-pool.js';
import { createTouchView } from './touch-view.js';
import { createPhotoLayout, loadImage, photoCaption } from './display/photo-layout.js';
import { createNoticePanel } from './display/notice-panel.js';
import { createWallController } from './display/wall-controller.js';

const scheduler = createAdaptiveScheduler(loadImage),
  stage = document.querySelector('#stage');
const empty = document.querySelector('#empty'),
  message = document.querySelector('#empty-message');
const connection = document.querySelector('#connection');
let feed = null,
  current = null,
  currentItem = null,
  timeout,
  switching = false,
  authorized = false;
let currentIds = [];
let wakeLock;
const zoneParam = new URLSearchParams(location.search).get('zone');
const zone =
  zoneParam !== null && /^\d+$/.test(zoneParam) && Number(zoneParam) < 12
    ? Number(zoneParam)
    : null;
const wall = zone === null;
document.body.classList.add(wall ? 'quad-wall' : 'quad-zone');
let paused = false,
  portraitTurns = 0;
const { fitCaptions, fitSmartCrops } = createPhotoLayout({
  getSlide: () => current,
  getFeed: () => feed,
});
const slides = createSlides(fitSmartCrops);
const touch = wall
  ? createTouchView({
      onChange(active) {
        document.body.classList.toggle('touch-active', active);
        for (const frame of stage.querySelectorAll('.wall-zone'))
          frame.contentWindow.postMessage(
            { type: active ? 'wall-pause' : 'wall-resume' },
            location.origin,
          );
        if (!active) controller.dispatch();
      },
    })
  : null;
const controller = wall
  ? createWallController({
      stage,
      getFeed: () => feed,
      hasNotice: () => notice.hasNotice(),
      isTouchActive: () => touch.active,
      onTouch: () => touch.enter(feed),
      onPosition: () => notice.position(),
    })
  : null;
const notice = createNoticePanel({
  enabled: wall,
  getFeed: () => feed,
  getLayout: () => controller?.layout,
});

document.addEventListener('pointerdown', () => {
  if (wall) touch.enter(feed);
  else if (parent !== window) parent.postMessage({ type: 'wall-touch' }, location.origin);
});
if (!wall)
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'wall-advance' && !paused) void advance();
    if (event.data?.type === 'wall-refresh') void getFeed();
    if (event.data?.type === 'wall-pause') {
      paused = true;
      clearTimeout(timeout);
    }
    if (event.data?.type === 'wall-resume') {
      paused = false;
      schedule(500);
    }
  });
const preview = new URLSearchParams(location.search).has('preview');
if (preview) document.body.classList.add('preview');
function noContent(text) {
  empty.hidden = false;
  message.textContent = text;
}
function clearSlide(text) {
  clearTimeout(timeout);
  slides.clear();
  current?.remove();
  current = null;
  currentItem = null;
  currentIds = [];
  stage.querySelectorAll('.slide').forEach((slide) => slide.remove());
  noContent(text);
}
async function getFeed() {
  try {
    const response = await fetch('/api/display/feed', { cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        feed = null;
        notice.update([]);
        authorized = false;
        touch?.leave();
        streamPool.clear();
        controller?.clear();
        clearSlide('Bitte öffne den Monitor-Link aus dem Adminbereich.');
        connection.hidden = true;
        return;
      }
      throw new Error('Server unavailable');
    }
    authorized = true;
    feed = await response.json();
    applyAppearance(feed.appearance);
    connection.hidden = true;
    notice.update(feed.items);
    touch?.update(feed);
    feed.items = feed.items.filter((item) => item.type !== 'text');
    document.title = feed.settings.title;
    if (wall) {
      streamPool.sync(feed.settings.touchEnabled ? feed.touchItems : []);
      empty.hidden = true;
      controller.mount();
      notice.position();
      controller.dispatch();
      return;
    }
    // Each photo belongs to one field, preventing simultaneous duplicates.
    feed.items = itemsForZone(
      feed.items,
      zone,
      wallLayout(feed.settings, Boolean(notice.hasNotice() || feed.calendar?.events?.length)),
    );
    feed.settings.photosPerScreen = feed.settings.photosPerScreen === 1 ? 1 : 2;
    streamPool.sync(feed.items);
    feed.settings.shuffle = true;
    if (!feed.items.length) {
      clearSlide(
        appearance.emptyMessage || 'Noch keine Inhalte. Neue Bilder erscheinen hier automatisch.',
      );
      return;
    }
    if (currentIds.some((id) => !feed.items.some((item) => item.id === id))) {
      clearSlide('Inhalte werden aktualisiert …');
    }
    if (
      [...(current?.querySelectorAll('.photo-tile') || [])].some(
        (tile) =>
          tile.dataset.imageUrl !== feed.items.find((item) => item.id === tile.dataset.itemId)?.url,
      )
    )
      clearSlide('Ausrichtung wird aktualisiert …');
    current?.querySelectorAll('.photo-tile').forEach((tile) => {
      const photo = feed.items.find((item) => item.id === tile.dataset.itemId);
      if (!photo) return;
      const text = photoCaption(photo);
      let caption = tile.querySelector('.caption');
      if (!text) {
        caption?.remove();
        return;
      }
      if (!caption) {
        let footer = tile.querySelector('.photo-footer');
        if (!footer) {
          footer = document.createElement('div');
          footer.className = 'photo-footer';
          tile.append(footer);
        }
        caption = document.createElement('div');
        caption.className = 'caption';
        footer.prepend(caption);
      }
      caption.textContent = text;
    });
    fitCaptions();
    if (!current && !switching) schedule(0);
  } catch {
    connection.hidden = false;
    if (!current)
      noContent('Server nicht erreichbar. Die Verbindung wird automatisch erneut versucht.');
  }
}
function schedule(milliseconds) {
  clearTimeout(timeout);
  if (!wall && parent !== window)
    parent.postMessage({ type: 'wall-ready', delay: milliseconds }, location.origin);
  else timeout = setTimeout(advance, milliseconds);
}
async function advance() {
  if (!feed || !authorized || switching || paused) {
    if (!wall) parent.postMessage({ type: 'wall-done' }, location.origin);
    return;
  }
  clearTimeout(timeout);
  switching = true;
  let transitionWait = 0;
  try {
    let loaded = [];
    for (let attempt = 0; attempt < feed.items.length + 1; attempt++) {
      loaded = await scheduler.next(feed.items, feed.settings);
      if (loaded.length) break;
    }
    if (!loaded.length) {
      connection.hidden = false;
      schedule(10_000);
      return;
    }
    loaded = loaded.filter(
      ({ item }) => authorized && !paused && feed?.items.some((value) => value.id === item.id),
    );
    if (!loaded.length) return;
    if (
      zone ===
      portraitPair(
        wallLayout(feed.settings, Boolean(notice.hasNotice() || feed.calendar?.events?.length)),
      )?.top
    ) {
      const portrait = loaded.find(
        (entry) => entry.image && entry.image.naturalHeight > entry.image.naturalWidth,
      );
      const expanded = Boolean(
        feed.settings.portraitFeature && portrait && ++portraitTurns % 4 === 0,
      );
      if (expanded) loaded = [portrait];
      parent.postMessage({ type: 'wall-portrait', expanded }, location.origin);
    }
    const item = loaded[0].item,
      settings = feed.settings;
    if (
      item.type === 'stream' &&
      currentItem?.id === item.id &&
      currentItem.stream_kind === item.stream_kind &&
      current?.classList.contains('stream-slide')
    ) {
      currentItem = item;
      schedule(pageDelay(loaded));
      return;
    }
    const slide = slides.create(loaded, settings);
    let transition = settings.transition;
    if (transition === 'random')
      transition = ['fade', 'slide', 'zoom'][Math.floor(Math.random() * 3)];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) transition = 'none';
    const duration = transition === 'none' ? 0 : settings.transitionDuration;
    transitionWait = duration + 50;
    slide.style.setProperty('--transition-ms', `${duration}ms`);
    const splitUpdate = loaded.length === 2 && current?.classList.contains('photos-2');
    const previousDisplayIds = currentIds;
    const previous = splitUpdate ? null : current;
    if (splitUpdate) {
      [...slide.children].forEach((tile, index) => {
        const old = current.children[index];
        if (old.dataset.itemId !== tile.dataset.itemId) {
          tile.style.setProperty('--transition-ms', `${duration}ms`);
          tile.classList.add(`enter-${transition}`);
          old.replaceWith(tile);
        } else {
          old.querySelector('.photo-footer')?.remove();
          const footer = tile.querySelector('.photo-footer');
          if (footer) old.append(footer);
        }
      });
    } else {
      slide.classList.add(`enter-${transition}`);
      stage.append(slide);
      current = slide;
    }
    empty.hidden = true;
    currentItem = item;
    currentIds = loaded.map(({ item }) => item.id);
    fitCaptions();
    setTimeout(() => slides.dispose(previous), duration + 50);
    // Duration is the full dwell time; transition is bounded below the shortest dwell.
    const changed = loaded.find(
      (entry) => !splitUpdate || entry.item.id !== previousDisplayIds[loaded.indexOf(entry)],
    );
    schedule(pageDelay(loaded, changed));
  } finally {
    await new Promise((resolve) => setTimeout(resolve, transitionWait));
    switching = false;
    if (!wall) parent.postMessage({ type: 'wall-done' }, location.origin);
  }
}
async function acquireWakeLock() {
  if (wakeLock && !wakeLock.released) return;
  try {
    if (!preview && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    /* Device/browser policy controls wake locks. */
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void getFeed();
    void acquireWakeLock();
  }
});
window.addEventListener('resize', notice.render);
window.addEventListener('resize', notice.position);
async function start() {
  if (location.hash.length > 1) {
    const token = location.hash.slice(1);
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const response = await fetch('/api/display/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        noContent(
          'Dieser Monitor-Link ist ungültig. Bitte einen neuen Link aus dem Adminbereich öffnen.',
        );
        return;
      }
    } catch {
      noContent('Verbindung fehlgeschlagen. Bitte den ursprünglichen Monitor-Link erneut öffnen.');
      return;
    }
  }
  await getFeed();
  setInterval(getFeed, 10_000);
  await acquireWakeLock();
}
start();
document.fonts.ready.then(notice.fit);

window.addEventListener('resize', fitCaptions);
document.fonts.ready.then(fitCaptions);

void loadAppearance();
