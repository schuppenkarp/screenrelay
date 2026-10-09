import { wallLayout, portraitPair } from '../wall-layout.js';

export function createWallController({
  stage,
  getFeed,
  hasNotice,
  isTouchActive,
  onTouch,
  onPosition,
}) {
  let zonesMounted = false,
    layoutSignature = '',
    layout,
    expandedPair = null;
  // The parent grants one transition at a time across all fields.
  const waitingZones = new Map();
  let busyZone = null,
    lastSwitchFinished = 0,
    dispatchTimer;
  function dispatchZone() {
    clearTimeout(dispatchTimer);
    if (isTouchActive() || busyZone !== null || !waitingZones.size) return;
    const [index, due] = [...waitingZones].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
    const delay = Math.max(due, lastSwitchFinished + 750) - Date.now();
    if (delay > 0) {
      dispatchTimer = setTimeout(dispatchZone, delay);
      return;
    }
    const frame = stage.querySelector(`.zone-${index}`);
    waitingZones.delete(index);
    if (!frame || frame.hidden) {
      dispatchZone();
      return;
    }
    busyZone = index;
    frame.contentWindow.postMessage({ type: 'wall-advance' }, location.origin);
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    const index = [...stage.querySelectorAll('.wall-zone')].findIndex(
      (frame) => frame.contentWindow === event.source,
    );
    if (index < 0) return;
    if (event.data?.type === 'wall-touch') {
      onTouch();
      return;
    }
    if (
      event.data?.type === 'wall-portrait' &&
      busyZone === index &&
      index === portraitPair(layout)?.top
    ) {
      setPortraitExpanded(Boolean(getFeed().settings.portraitFeature && event.data.expanded));
    }
    if (event.data?.type === 'wall-ready')
      waitingZones.set(index, Date.now() + Math.max(0, Number(event.data.delay) || 0));
    if (event.data?.type === 'wall-done' && busyZone === index) {
      busyZone = null;
      lastSwitchFinished = Date.now();
    }
    dispatchZone();
  });
  function setPortraitExpanded(expanded) {
    const pair = expanded ? portraitPair(layout) : expandedPair;
    if (!pair) return;
    const upper = stage.querySelector(`.zone-${pair.top}`);
    const lower = stage.querySelector(`.zone-${pair.bottom}`);
    if (!upper || !lower) return;
    upper.style.gridRow = `${layout.slots[pair.top].row + 1}${expanded ? ' / span 2' : ''}`;
    const wasHidden = lower.hidden;
    lower.hidden = expanded || pair.bottom === layout.noticeIndex;
    expandedPair = expanded ? pair : null;
    if (wasHidden && !lower.hidden) waitingZones.set(pair.bottom, Date.now() + 1500);
  }
  function mountZones() {
    layout = wallLayout(
      getFeed().settings,
      Boolean(hasNotice() || getFeed().calendar?.events?.length),
    );
    const signature = JSON.stringify([layout.columns, layout.rows, layout.noticeIndex]);
    const columns =
      layout.columns === 2
        ? `${getFeed().settings.layoutLeftPercent}fr ${100 - getFeed().settings.layoutLeftPercent}fr`
        : `repeat(${layout.columns},minmax(0,1fr))`;
    stage.style.gridTemplateColumns = columns;
    stage.style.gridTemplateRows = `repeat(${layout.rows},minmax(0,1fr))`;
    stage.style.gap = getFeed().settings.layoutGap + 'px';
    stage.style.padding = getFeed().settings.layoutPadding + 'px';
    onPosition();
    if (zonesMounted && layoutSignature === signature) {
      if (!getFeed().settings.portraitFeature) setPortraitExpanded(false);
      return;
    }
    layoutSignature = signature;
    waitingZones.clear();
    busyZone = null;
    clearTimeout(dispatchTimer);
    expandedPair = null;
    stage.querySelectorAll('.wall-zone').forEach((frame) => frame.remove());
    zonesMounted = true;
    for (let index = 0; index < layout.slots.length; index++) {
      const frame = document.createElement('iframe');
      frame.className = `wall-zone zone-${index}`;
      frame.title = `Fotofeld ${index + 1}`;
      frame.src = `/display?zone=${index}&preview`;
      const slot = layout.slots[index];
      frame.style.gridColumn = slot.column + 1;
      frame.style.gridRow = slot.row + 1;
      frame.hidden = index === layout.noticeIndex;
      frame.onload = () => {
        if (isTouchActive())
          frame.contentWindow.postMessage({ type: 'wall-pause' }, location.origin);
      };
      stage.append(frame);
    }
  }

  function clear() {
    clearTimeout(dispatchTimer);
    waitingZones.clear();
    busyZone = null;
    zonesMounted = false;
    stage.querySelectorAll('.wall-zone').forEach((frame) => frame.remove());
  }
  return {
    mount: mountZones,
    dispatch: dispatchZone,
    clear,
    get layout() {
      return layout;
    },
  };
}
