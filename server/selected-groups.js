import { matchesGroupName } from '../public/group-patterns.js';
// Legacy single-group settings remain readable until the next group selection is saved.
export function manualGroupIds(settings) {
  return Array.isArray(settings.groupIds)
    ? [...new Set(settings.groupIds.filter((id) => typeof id === 'string' && id))]
    : settings.groupId
      ? [settings.groupId]
      : [];
}
export function groupRule(settings, id) {
  if (manualGroupIds(settings).includes(id)) return settings.groupRules?.[id] || { mode: 'all' };
  const group = settings.knownGroups?.find((entry) => entry.id === id);
  if (!group) return null;
  return settings.groupPatterns?.find((rule) => matchesGroupName(group.name, rule.pattern)) || null;
}
export function selectedGroupIds(settings) {
  return [
    ...new Set([
      ...manualGroupIds(settings),
      ...(settings.knownGroups || [])
        .filter((group) => groupRule(settings, group.id))
        .map((group) => group.id),
    ]),
  ];
}
export const selectedGroupsSql = (settings) => JSON.stringify(selectedGroupIds(settings));
export const acceptsGroup = (settings, id) => selectedGroupIds(settings).includes(id);

export function acceptsCaption(settings, groupId, caption) {
  if (!acceptsGroup(settings, groupId)) return false;
  const rule = groupRule(settings, groupId);
  if (!rule || rule.mode === 'all') return true;
  if (rule.mode !== 'hashtag' || !rule.hashtag) return false;
  const tags =
    String(caption || '')
      .normalize('NFC')
      .match(/(?<![\p{L}\p{N}_#])#[\p{L}\p{N}_]+/gu) || [];
  return tags.some((tag) => tag.toLowerCase() === rule.hashtag.normalize('NFC').toLowerCase());
}
