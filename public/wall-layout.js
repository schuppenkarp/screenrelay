export function wallLayout(settings, hasNotice = false) {
  const columns = settings.layoutColumns || 2,
    rows = settings.layoutRows || 2;
  const slots =
    columns === 2 && rows === 2
      ? [
          { column: 0, row: 0 },
          { column: 0, row: 1 },
          { column: 1, row: 1 },
          { column: 1, row: 0 },
        ]
      : Array.from({ length: columns * rows }, (_, index) => ({
          column: index % columns,
          row: Math.floor(index / columns),
        }));
  const position = settings.noticePosition || 'top-right';
  const noticeIndex =
    hasNotice && position !== 'off'
      ? slots.findIndex(
          (slot) =>
            slot.column === (position.endsWith('right') ? columns - 1 : 0) &&
            slot.row === (position.startsWith('bottom') ? rows - 1 : 0),
        )
      : -1;
  return { columns, rows, slots, noticeIndex };
}

// Prefer the leftmost available vertical pair; never cover the information board.
export function portraitPair(layout) {
  for (let column = 0; column < layout.columns; column++) {
    for (let row = 0; row < layout.rows - 1; row++) {
      const top = layout.slots.findIndex((slot) => slot.column === column && slot.row === row);
      const bottom = layout.slots.findIndex(
        (slot) => slot.column === column && slot.row === row + 1,
      );
      if (top !== layout.noticeIndex && bottom !== layout.noticeIndex) return { top, bottom };
    }
  }
  return null;
}

export function itemsForZone(items, zone, layout) {
  const media = items.filter(
    (item) => ['image', 'stream'].includes(item.type) && item.visible !== false,
  );
  const slots = layout.slots.map((_, i) => i).filter((i) => i !== layout.noticeIndex);
  const pins = media.filter((item) => item.pinned);
  const pinZone = slots[0];
  if (slots.length === 1 && zone === pinZone) return media;
  if (pins.length && zone === pinZone) return pins;
  const photoZones = slots.filter((i) => !pins.length || i !== pinZone);
  // One field must be able to mix fixed content and ordinary photos.
  if (!photoZones.includes(zone)) return [];
  return media
    .filter((item) => !item.pinned)
    .filter((_, index) => photoZones[index % photoZones.length] === zone);
}

export function touchDeadline(settings, now = Date.now()) {
  return now + settings.touchDuration * 1000;
}
