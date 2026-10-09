import { loadAppearance } from './appearance.js';
import { createNoticePanel } from './display/notice-panel.js';

// Render only the notice, never photo playback or camera connections.
const feed = { settings: { layoutPadding: 0, layoutGap: 0 }, calendar: { events: [] } };
const panel = createNoticePanel({
  enabled: true,
  getFeed: () => feed,
  getLayout: () => ({ noticeIndex: 0, columns: 1, rows: 1, slots: [{ column: 0, row: 0 }] }),
});
let body = '';
function render() {
  panel.update([{ type: 'text', body }]);
}
window.addEventListener('message', (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== parent ||
    event.data?.type !== 'notice-preview'
  )
    return;
  if (typeof event.data.body !== 'string') return;
  body = event.data.body;
  render();
});
loadAppearance()
  .then(() => panel.render())
  .catch(() => {});
fetch('/api/calendar')
  .then((response) => (response.ok ? response.json() : null))
  .then((calendar) => {
    if (calendar) feed.calendar = calendar;
    render();
  })
  .catch(() => {});
document.fonts.ready.then(() => panel.fit());
