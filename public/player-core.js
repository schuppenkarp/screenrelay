// Cursors survive feed refreshes; short photo collections never starve pinned content.
export function zoneItems(items, zone, hasNotice) {
  const images = items.filter((item) => item.type === 'image' && item.visible !== false);
  const pins = images.filter((item) => item.pinned);
  if (pins.length && zone === 0) return pins;
  const zones = (hasNotice ? [0, 1, 2] : [0, 1, 2, 3]).filter(
    (index) => !pins.length || index !== 0,
  );
  if (!zones.includes(zone)) return [];
  return images
    .filter((item) => !item.pinned)
    .filter((item, index) => zones[index % zones.length] === zone);
}

export function pageDelay(entries, changed) {
  const rotating = entries.filter((entry) => !entry.item.pinned);
  const seconds = (changed && !changed.item.pinned ? changed : rotating[0] || changed || entries[0])
    .item.seconds;
  return (seconds * 1000) / (entries.length === 2 && rotating.length === 2 ? 2 : 1);
}

export function createScheduler() {
  let photoId = null,
    pinId = null,
    photosSincePin = 0;
  const bags = { photos: [], pins: [] };
  const randomNext = (items, kind, previous) => {
    bags[kind] = bags[kind].filter((id) => items.some((item) => item.id === id));
    if (!bags[kind].length) {
      const ids = items.map((item) => item.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      if (ids.length > 1 && ids[0] === previous) [ids[0], ids[1]] = [ids[1], ids[0]];
      bags[kind] = ids;
    }
    const id = bags[kind].shift();
    return items.find((item) => item.id === id);
  };
  const following = (items, id) =>
    items[(items.findIndex((item) => item.id === id) + 1) % items.length];
  return {
    next(items, settings) {
      const visible = items.filter((item) => item.visible !== false);
      const photos = visible.filter((item) => !item.pinned),
        pins = visible.filter((item) => item.pinned);
      if (!photos.length && !pins.length) return null;
      let item;
      if (pins.length && (!photos.length || photosSincePin >= settings.pinInterval)) {
        item = settings.shuffle ? randomNext(pins, 'pins', pinId) : following(pins, pinId);
        pinId = item.id;
        photosSincePin = 0;
      } else {
        item = settings.shuffle
          ? randomNext(photos, 'photos', photoId)
          : following(photos, photoId);
        photoId = item.id;
        photosSincePin++;
      }
      return {
        ...item,
        seconds: item.duration ?? (item.pinned ? settings.pinDuration : settings.photoDuration),
      };
    },
  };
}

export function createAdaptiveScheduler(loadImage) {
  const scheduler = createScheduler();
  let pending = null,
    slots = [],
    replaceSide = 0;
  return {
    async next(items, settings) {
      slots = slots
        .filter((entry) =>
          items.some(
            (item) =>
              item.id === entry.item.id && item.url === entry.item.url && item.visible !== false,
          ),
        )
        .map((entry) => ({
          ...entry,
          item: { ...entry.item, ...items.find((item) => item.id === entry.item.id) },
        }));
      const take = async () => {
        let item;
        if (pending && items.some((value) => value.id === pending.id)) {
          item = items.find((value) => value.id === pending.id);
          item = {
            ...item,
            seconds: item.duration ?? (item.pinned ? settings.pinDuration : settings.photoDuration),
          };
        } else item = scheduler.next(items, settings);
        pending = null;
        if (!item) return null;
        try {
          return { item, image: item.type === 'image' ? await loadImage(item.url) : null };
        } catch {
          return null;
        }
      };
      let first = await take();
      if (!first) return [];
      const portrait = (entry) =>
        entry.image && entry.image.naturalHeight > entry.image.naturalWidth;
      if (slots.length === 2 && settings.photosPerScreen !== 1) {
        for (
          let attempt = 0;
          attempt < items.length && slots.some((entry) => entry.item.id === first.item.id);
          attempt++
        ) {
          const next = await take();
          if (!next) break;
          first = next;
        }
        if (!portrait(first)) return [first];
        if (slots.some((entry) => entry.item.id === first.item.id)) return slots;
        let side = replaceSide;
        const pinnedSide = slots.findIndex((entry) => entry.item.pinned);
        if (pinnedSide >= 0) side = first.item.pinned ? pinnedSide : 1 - pinnedSide;
        slots[side] = first;
        replaceSide = 1 - side;
        return [...slots];
      }
      if (!portrait(first) || settings.photosPerScreen === 1) return [first];
      if (items.filter((item) => item.type === 'image').length < 2) return [first];
      const second = await take();
      if (!second) return [first];
      if (portrait(second) && second.item.id !== first.item.id) {
        slots = [first, second];
        replaceSide = 0;
        return [...slots];
      }
      pending = second.item;
      return [first];
    },
  };
}

export function createPageScheduler() {
  const scheduler = createScheduler();
  let pending = null;
  return {
    next(items, settings) {
      const first =
        pending && items.some((item) => item.id === pending.id)
          ? { ...items.find((item) => item.id === pending.id), seconds: pending.seconds }
          : scheduler.next(items, settings);
      pending = null;
      if (!first) return [];
      const page = [first];
      if (first.pinned || first.type !== 'image') return page;
      const count = Math.min(
        settings.photosPerScreen || 4,
        items.filter((item) => !item.pinned && item.type === 'image').length,
      );
      while (page.length < count) {
        const next = scheduler.next(items, settings);
        if (!next) break;
        if (next.pinned || next.type !== 'image' || page.some((item) => item.id === next.id)) {
          pending = next;
          break;
        }
        page.push(next);
      }
      return page;
    },
  };
}
