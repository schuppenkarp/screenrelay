import { appearance } from '../appearance.js';
import { fitNoticeColumns } from '../notice-layout.js';
import { renderNoticeContent } from '../notice-content.js';

export function createNoticePanel({ enabled, getFeed, getLayout }) {
  function positionInfoPanel() {
    const layout = getLayout();
    if (!enabled || !getFeed() || !layout || layout.noticeIndex < 0) {
      infoPanel.hidden = true;
      return;
    }
    const slot = layout.slots[layout.noticeIndex],
      padding = getFeed().settings.layoutPadding,
      gap = getFeed().settings.layoutGap;
    const innerWidth = window.innerWidth - 2 * padding - gap * (layout.columns - 1);
    const widths =
      layout.columns === 2
        ? [
            (innerWidth * getFeed().settings.layoutLeftPercent) / 100,
            (innerWidth * (100 - getFeed().settings.layoutLeftPercent)) / 100,
          ]
        : Array(layout.columns).fill(innerWidth / layout.columns);
    const height = (window.innerHeight - 2 * padding - gap * (layout.rows - 1)) / layout.rows;
    Object.assign(infoPanel.style, {
      left:
        padding +
        widths.slice(0, slot.column).reduce((a, b) => a + b, 0) +
        slot.column * gap +
        'px',
      top: padding + slot.row * (height + gap) + 'px',
      right: 'auto',
      bottom: 'auto',
      width: widths[slot.column] + 'px',
      height: height + 'px',
    });
    infoPanel.hidden = !(notices.length || getFeed().calendar?.events?.length);
    fitNoticeColumns(infoPanel, appearance.calendarMaxEvents);
  }
  const infoPanel = document.createElement('aside');
  infoPanel.id = 'info-panel';
  infoPanel.hidden = true;
  infoPanel.setAttribute('aria-label', 'Infotafel');
  document.body.append(infoPanel);
  let notices = [],
    noticeSignature = '';
  function syncNoticeSpace() {
    if (enabled) positionInfoPanel();
  }
  function fitNotice() {
    if (!enabled) return;
    document.body.classList.remove('notice-expanded');
    fitNoticeColumns(infoPanel, appearance.calendarMaxEvents);
    syncNoticeSpace();
  }
  function renderNotice() {
    if (!enabled) {
      infoPanel.hidden = true;
      return;
    }
    const events = getFeed()?.calendar?.events || [];
    const notice = notices[0] || (events.length ? { body: '' } : null);
    infoPanel.hidden = !notice;
    if (!notice) {
      infoPanel.replaceChildren();
      fitNotice();
      return;
    }
    const brand = document.createElement('img');
    brand.src = appearance.logo;
    brand.alt = appearance.name;
    const body = document.createElement('div');
    body.className = 'info-markdown';
    const content = document.createElement('div');
    content.className = 'info-content';
    content.innerHTML = renderNoticeContent(notice.body || '');
    if (content.innerHTML.trim()) body.append(content);
    const columns = document.createElement('div');
    columns.className = 'info-columns';
    columns.append(body);
    infoPanel.replaceChildren(brand, columns);
    if (events.length) {
      const calendar = document.createElement('section');
      calendar.className = 'info-calendar';
      const heading = document.createElement('h3');
      heading.textContent = appearance.calendarHeading;
      calendar.append(heading);
      for (const event of events) {
        const row = document.createElement('div');
        row.className = 'calendar-event';
        const date = document.createElement('time');
        date.dateTime = event.start;
        date.textContent =
          new Intl.DateTimeFormat(appearance.locale, {
            timeZone: appearance.timeZone,
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            ...(event.allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
          }).format(new Date(event.start)) + (event.allDay ? ' · ganztägig' : '');
        const title = document.createElement('strong');
        title.textContent = event.title;
        row.append(date, title);
        calendar.append(row);
      }
      if (getFeed().calendar.failed) {
        const hint = document.createElement('small');
        hint.textContent = 'Kalender momentan nicht aktualisierbar';
        calendar.append(hint);
      }
      columns.append(calendar);
    }
    brand.onload = fitNotice;
    document.fonts.ready.then(fitNotice);
    fitNotice();
  }
  function updateNotices(items) {
    const next = items.filter((item) => item.type === 'text').slice(0, 1);
    const signature = JSON.stringify([next, getFeed()?.calendar, getFeed()?.appearance]);
    if (signature !== noticeSignature) {
      noticeSignature = signature;
      notices = next;
      renderNotice();
    }
  }

  return {
    update: updateNotices,
    render: renderNotice,
    fit: fitNotice,
    position: positionInfoPanel,
    hasNotice: () => notices.length > 0,
  };
}
