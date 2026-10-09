/** Scale a real monitor-sized preview without changing its layout viewport. */
export function createNoticePreview(host) {
  const frame = host.querySelector('iframe');
  let body = '';
  function send() {
    frame.contentWindow?.postMessage({ type: 'notice-preview', body }, location.origin);
  }
  const observer = new ResizeObserver(() => {
    frame.style.transform = `scale(${host.clientWidth / 960})`;
  });
  observer.observe(host);
  frame.addEventListener('load', send);
  return {
    update(value) {
      body = value;
      send();
    },
    dispose() {
      observer.disconnect();
      frame.removeEventListener('load', send);
    },
  };
}
