// Expiry affects playback only. Originals remain available to the administrator.
export function displayItems(items, settings, now = Date.now()) {
  const visible = items.filter((item) => item.visible);
  const photos = visible
    .filter((item) => item.type === 'image' && item.source === 'whatsapp' && !item.pinned)
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
  const keep = new Set(photos.slice(0, settings.minimumPhotos).map((item) => item.id));
  const cutoff = now - settings.retentionDays * 86_400_000;
  const eligible = visible.filter(
    (item) =>
      !settings.retentionDays ||
      item.type !== 'image' ||
      item.source !== 'whatsapp' ||
      item.pinned ||
      keep.has(item.id) ||
      item.created > cutoff,
  );
  if (!settings.maximumPhotos) return eligible;
  const newest = new Set(
    eligible
      .filter((item) => item.type === 'image' && !item.pinned)
      .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
      .slice(0, settings.maximumPhotos)
      .map((item) => item.id),
  );
  return eligible.filter((item) => item.type !== 'image' || item.pinned || newest.has(item.id));
}
