import Hls from './vendor/hls.mjs';

export function mountStream(container, item, { fit = 'contain' } = {}) {
  const status = document.createElement('div');
  status.className = 'stream-status';
  status.textContent = 'Kamera wird verbunden …';
  const label = document.createElement('div');
  label.className = 'stream-label';
  label.textContent = item.title;
  const media = document.createElement(item.stream_kind === 'mjpeg' ? 'img' : 'video');
  media.className = 'stream-media';
  media.style.objectFit = fit;
  if (media.tagName === 'IMG') media.alt = item.title;
  else {
    media.muted = true;
    media.autoplay = true;
    media.playsInline = true;
  }
  container.append(media, status, label);
  let hls,
    flv,
    retry,
    failed = false,
    stopped = false;
  const ready = () => {
    status.hidden = true;
  };
  const fail = () => {
    if (stopped) return;
    failed = true;
    status.hidden = false;
    status.textContent = 'Kamera nicht erreichbar · erneuter Versuch …';
    clearTimeout(retry);
    retry = setTimeout(connect, 5000);
  };
  media.addEventListener('load', ready);
  media.addEventListener('playing', ready);
  media.addEventListener('error', fail);
  // Chromium renders multipart JPEG frames without completing an image load event.
  const readiness = setInterval(() => {
    if (!failed && media.tagName === 'IMG' && media.naturalWidth > 0) ready();
  }, 500);
  function connect() {
    if (stopped) return;
    failed = false;
    hls?.destroy();
    hls = null;
    flv?.destroy();
    flv = null;
    if (['flv', 'reolink'].includes(item.stream_kind)) {
      const mpegts = window.mpegts;
      if (!mpegts?.isSupported()) {
        status.hidden = false;
        status.textContent = 'Dieser Browser unterstützt den Kamerastream nicht.';
        return;
      }
      mpegts.LoggingControl.enableAll = false;
      flv = mpegts.createPlayer(
        { type: 'flv', isLive: true, url: item.url },
        {
          enableWorker: false,
          enableWorkerForMSE: false,
          enableStashBuffer: false,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 2,
          liveBufferLatencyMinRemain: 0.5,
          autoCleanupSourceBuffer: true,
        },
      );
      flv.on(mpegts.Events.ERROR, fail);
      flv.attachMediaElement(media);
      flv.load();
    } else if (item.stream_kind === 'hls' && Hls.isSupported()) {
      hls = new Hls({ enableWorker: false, lowLatencyMode: true, maxBufferLength: 10 });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) fail();
      });
      hls.loadSource(item.url);
      hls.attachMedia(media);
    } else {
      media.src = item.url + (item.url.includes('?') ? '&' : '?') + 'attempt=' + Date.now();
    }
    if (media.tagName === 'VIDEO')
      void media.play().catch((error) => {
        // Reparenting a retained video can interrupt play(), but not its connection.
        if (error.name !== 'AbortError') fail();
      });
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(readiness);
    hls?.destroy();
    flv?.destroy();
    media.removeEventListener('error', fail);
    media.removeEventListener('load', ready);
    media.removeEventListener('playing', ready);
    if (media.tagName === 'VIDEO') {
      media.pause();
      media.removeAttribute('src');
      media.load();
    } else media.removeAttribute('src');
    container.replaceChildren();
  };
}
