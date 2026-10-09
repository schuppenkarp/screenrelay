import { streamPool } from '../stream-pool.js';
import { photoCaption } from './photo-layout.js';

export function createSlides(onImageLoad) {
  const streamCleanups = new Map();
  function dispose(slide) {
    streamCleanups.get(slide)?.();
    streamCleanups.delete(slide);
    slide?.remove();
  }
  function clear() {
    for (const slide of streamCleanups.keys()) dispose(slide);
  }
  function create(entries, settings) {
    const item = entries[0].item;
    const slide = document.createElement('section');
    slide.className = 'slide';
    if (item.type === 'image') {
      slide.classList.add('photo-grid', `photos-${entries.length}`);
      for (const { item: photo, image } of entries) {
        const tile = document.createElement('div');
        tile.className = 'photo-tile';
        tile.dataset.itemId = photo.id;
        tile.dataset.imageUrl = photo.url;
        const renderedImage = image.cloneNode();
        renderedImage.onload = onImageLoad;
        renderedImage.alt = photo.title;
        renderedImage.style.objectFit = settings.fit;
        tile.append(renderedImage);
        const footer = document.createElement('div');
        footer.className = 'photo-footer';
        const captionText = photoCaption(photo);
        if (captionText) {
          const caption = document.createElement('div');
          caption.className = 'caption';
          caption.textContent = captionText;
          footer.append(caption);
        }
        if (photo.sender) {
          const sender = document.createElement('div');
          sender.className = 'sender-name';
          sender.textContent = photo.sender;
          footer.append(sender);
        }
        if (footer.childElementCount) tile.append(footer);
        slide.append(tile);
      }
    } else if (item.type === 'stream') {
      slide.classList.add('stream-slide');
      streamCleanups.set(slide, streamPool.mount(slide, item, { fit: settings.fit }));
    }
    return slide;
  }
  return { create, dispose, clear };
}
