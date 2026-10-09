import { smartCropPosition } from '../smart-crop.js';

export function createPhotoLayout({ getSlide, getFeed }) {
  function fitCaptions() {
    fitSmartCrops();
    getSlide()
      ?.querySelectorAll('.photo-tile')
      .forEach((tile) => {
        const caption = tile.querySelector('.caption');
        if (!caption) return;
        caption.hidden = false;
        const lineHeight = parseFloat(getComputedStyle(caption).lineHeight);
        const senderHeight =
          tile.querySelector('.sender-name')?.getBoundingClientRect().height || 0;
        const availableHeight = Math.min(
          lineHeight * 3 + 1,
          tile.clientHeight * 0.22 - senderHeight - 16,
        );
        caption.hidden =
          caption.scrollHeight > availableHeight || caption.scrollWidth > caption.clientWidth + 1;
      });
  }
  function fitSmartCrops() {
    getSlide()
      ?.querySelectorAll('.photo-tile')
      .forEach((tile) => {
        const image = tile.querySelector('img');
        if (!image) return;
        let focus = null;
        try {
          focus = JSON.parse(
            getFeed()?.items.find((item) => item.id === tile.dataset.itemId)?.crop_focus || 'null',
          );
        } catch {}
        const position = getFeed()?.smartCrop
          ? smartCropPosition(
              focus,
              image.naturalWidth,
              image.naturalHeight,
              tile.clientWidth,
              tile.clientHeight,
            )
          : null;
        image.style.objectFit = getFeed()?.smartCrop
          ? position
            ? 'cover'
            : 'contain'
          : getFeed()?.settings.fit || 'contain';
        image.style.objectPosition = position ? `${position.x}% ${position.y}%` : '50% 50%';
      });
  }
  return { fitCaptions, fitSmartCrops };
}
export async function loadImage(url) {
  const image = new Image();
  image.src = url;
  let watchdog;
  try {
    await Promise.race([
      image.decode(),
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('timeout')), 12_000);
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
  return image;
}

export function photoCaption(photo) {
  return (
    photo.body?.trim() ||
    (photo.title?.trim() && !/^(foto aus whatsapp|neues foto)$/i.test(photo.title.trim())
      ? photo.title
      : '')
  );
}
