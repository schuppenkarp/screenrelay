// A pin command must be adjacent: the group's import tag followed by #fix.
const commands = () => /(?<![\p{L}\p{N}_#])(#[\p{L}\p{N}_]+)#fix(?![\p{L}\p{N}_#])/giu;
export function hasPinHashtag(caption, rule) {
  if (!rule?.allowPin || !rule.hashtag) return false;
  return [
    ...String(caption || '')
      .normalize('NFC')
      .matchAll(commands()),
  ].some((match) => match[1].toLowerCase() === rule.hashtag.normalize('NFC').toLowerCase());
}
export function stripPinHashtag(caption, rule) {
  const value = String(caption || '').normalize('NFC');
  if (!rule?.allowPin || !rule.hashtag) return value;
  return value.replace(commands(), (command, tag) =>
    tag.toLowerCase() === rule.hashtag.normalize('NFC').toLowerCase() ? '' : command,
  );
}
