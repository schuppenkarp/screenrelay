import { streamPool } from './stream-pool.js';
import { renderNoticeContent } from './notice-content.js';
import { touchDeadline } from './wall-layout.js';

export function createTouchView({ onChange }) {
  const panel = document.createElement('section');
  panel.id = 'touch-view';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Kamera- und Fixinhalteansicht');
  document.body.append(panel);
  let active = false,
    deadline = 0,
    timer,
    signature = '',
    cleanups = [];
  const clear = () => {
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    panel.replaceChildren();
  };
  function leave() {
    clearTimeout(timer);
    active = false;
    panel.hidden = true;
    clear();
    signature = '';
    onChange(false);
  }
  function render(feed) {
    const next = JSON.stringify([
      feed.touchItems,
      feed.settings.touchColumns,
      feed.settings.fit,
      feed.settings.layoutGap,
      feed.settings.layoutPadding,
    ]);
    if (next === signature) return;
    signature = next;
    clear();
    const columns = Math.min(feed.settings.touchColumns, feed.touchItems.length);
    panel.style.gridTemplateColumns = `repeat(${columns}, minmax(0,1fr))`;
    panel.style.gridTemplateRows = `repeat(${Math.ceil(feed.touchItems.length / columns)}, minmax(0,1fr))`;
    panel.style.gap = feed.settings.layoutGap + 'px';
    panel.style.padding = feed.settings.layoutPadding + 'px';
    for (const item of feed.touchItems) {
      const tile = document.createElement('article');
      tile.className = 'touch-tile';
      tile.dataset.itemId = item.id;
      panel.append(tile);
      if (item.type === 'stream')
        cleanups.push(streamPool.mount(tile, item, { fit: feed.settings.fit }));
      else if (item.type === 'image') {
        const image = new Image();
        image.src = item.url;
        image.alt = item.title;
        image.style.objectFit = feed.settings.fit;
        tile.append(image);
        const label = document.createElement('div');
        label.className = 'stream-label';
        label.textContent = item.title;
        tile.append(label);
      } else {
        tile.classList.add('touch-notice');
        tile.innerHTML = renderNoticeContent(item.body);
      }
    }
  }
  return {
    get active() {
      return active;
    },
    enter(feed) {
      if (!feed?.settings.touchEnabled || !feed.touchItems?.length) return;
      deadline = touchDeadline(feed.settings);
      clearTimeout(timer);
      timer = setTimeout(leave, Math.max(0, deadline - Date.now()));
      if (!active) {
        active = true;
        panel.hidden = false;
        onChange(true);
      }
      render(feed);
    },
    update(feed) {
      if (!active) return;
      if (!feed?.settings.touchEnabled || !feed.touchItems?.length) {
        leave();
        return;
      }
      render(feed);
    },
    leave,
  };
}
