import { stripPinHashtag } from './pin-hashtag.js';
// Display-only transformation: persisted captions remain available in the admin and for moderation.
export function displayCaption(item, rule) {
  const mode =
    rule?.captionMode || (rule?.mode === 'hashtag' || item.hide_caption ? 'none' : 'full');
  if (mode === 'none') return { ...item, body: '', title: '' };
  if (mode !== 'removeHashtag' || !rule?.hashtag) return item;
  const strip = (value) =>
    stripPinHashtag(value, rule)
      .replace(/(?<![\p{L}\p{N}_#])#[\p{L}\p{N}_]+/gu, (tag) =>
        tag.toLowerCase() === rule.hashtag.normalize('NFC').toLowerCase() ? '' : tag,
      )
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  return { ...item, body: strip(item.body), title: item.body ? '' : strip(item.title) };
}
