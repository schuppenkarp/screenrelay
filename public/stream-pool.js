import { mountStream } from './stream-player.js';
import { createRetainedResources } from './retained-resources.js';

// Keep live media attached to the document while another photo or view is visible.
const parking = document.createElement('div');
parking.className = 'stream-parking';
parking.setAttribute('aria-hidden', 'true');
parking.inert = true;
document.body.append(parking);
export const streamPool = createRetainedResources({
  create(item, options) {
    const host = document.createElement('div');
    host.className = 'stream-host';
    parking.append(host);
    return { host, close: mountStream(host, item, options) };
  },
  attach(resource, target, item, { fit = 'contain' } = {}) {
    target.append(resource.host);
    resource.host.querySelector('.stream-label').textContent = item.title;
    const media = resource.host.querySelector('.stream-media');
    media.style.objectFit = fit;
    // Moving a video element can pause playback without closing its MediaSource.
    if (media.tagName === 'VIDEO') void media.play().catch(() => {});
  },
  park(resource) {
    parking.append(resource.host);
    const media = resource.host.querySelector('video');
    if (media) void media.play().catch(() => {});
  },
  destroy(resource) {
    resource.close();
    resource.host.remove();
  },
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) streamPool.clear();
});
