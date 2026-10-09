export function fitNoticeColumns(panel, maxEvents = 8) {
  const rows = [...panel.querySelectorAll('.calendar-event')];
  rows.forEach((row) => {
    row.hidden = true;
  });
  if (panel.hidden) return;
  const bottom =
    panel.getBoundingClientRect().bottom - parseFloat(getComputedStyle(panel).paddingBottom);
  const body = panel.querySelector('.info-markdown'),
    content = body?.querySelector('.info-content');
  if (content) {
    content.style.transform = '';
    content.style.width = '100%';
    body.style.height = 'auto';
    const style = getComputedStyle(body),
      padding =
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth);
    const available = Math.max(1, bottom - body.getBoundingClientRect().top - padding - 2);
    const width = content.getBoundingClientRect().width;
    // Search both directions: small source fonts grow, dense content shrinks.
    // Reflow at each candidate width; tables can impose a wider minimum width.
    const fits = (scale) => {
      content.style.width = `${width / scale}px`;
      return (
        content.scrollHeight * scale <= available && content.scrollWidth * scale <= width + 0.5
      );
    };
    let low = 0.01,
      high = 1;
    while (high < 64 && fits(high)) high *= 2;
    for (let step = 0; step < 18; step++) {
      const candidate = (low + high) / 2;
      if (fits(candidate)) low = candidate;
      else high = candidate;
    }
    const scale = low;
    fits(scale);
    content.style.transformOrigin = 'top left';
    content.style.transform = `scale(${scale})`;
    body.style.height = `${Math.max(0, bottom - body.getBoundingClientRect().top)}px`;
  }
  const warning = panel.querySelector('.info-calendar small'),
    calendar = panel.querySelector('.info-calendar');
  const reserve =
    (warning ? warning.getBoundingClientRect().height + 8 : 0) +
    (calendar ? parseFloat(getComputedStyle(calendar).paddingBottom) : 0);
  for (const row of rows.slice(0, maxEvents)) {
    row.hidden = false;
    if (row.getBoundingClientRect().bottom > bottom - reserve) {
      row.hidden = true;
      break;
    }
  }
}
