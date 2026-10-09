import { hasPinHashtag } from './pin-hashtag.js';
import { acceptsGroup, acceptsCaption, groupRule } from './selected-groups.js';
import { normalizeMessageId } from './message-id.js';
import { downloadImage } from './download-media.js';
import { senderName } from './sender-name.js';
import { notifyHeld } from './image-review.js';

export async function acknowledge(message, store) {
  normalizeMessageId(message);
  const origin = store.db
    .prepare('SELECT group_id FROM receipts WHERE message_id=?')
    .get(message.id._serialized);
  if (
    !store.settings().whatsappEnabled ||
    !origin ||
    !acceptsGroup(store.settings(), origin.group_id)
  )
    return false;
  if (await notifyHeld(message, store)) return true;
  const receipt = store.db
    .prepare('SELECT reacted FROM receipts WHERE message_id=?')
    .get(message.id._serialized);
  if (!receipt || receipt.reacted) return false;
  await message.react('👍');
  store.db.prepare('UPDATE receipts SET reacted=1 WHERE message_id=?').run(message.id._serialized);
  return true;
}

export async function importMessage(message, store, media, isActive = () => true) {
  const chatId = message.fromMe ? message.to : message.from;
  const caption = message.body || message.rawData?.caption || message._data?.caption || '';
  const eligible = () =>
    isActive() &&
    store.settings().whatsappEnabled &&
    acceptsCaption(store.settings(), chatId, caption);
  if (
    !eligible() ||
    !message.hasMedia ||
    message.type !== 'image' ||
    message.isViewOnce ||
    message.rawData?.isViewOnce
  )
    return null;
  const messageId = normalizeMessageId(message);
  if (store.db.prepare('SELECT message_id FROM receipts WHERE message_id=?').get(messageId))
    return null;
  let attachment;
  try {
    attachment = await downloadImage(message);
  } catch (cause) {
    throw new Error(`WhatsApp-Download fehlgeschlagen: ${cause.message || 'Unbekannter Fehler'}`, {
      cause,
    });
  }
  if (!attachment)
    throw new Error(
      'WhatsApp stellt die Bilddatei derzeit nicht bereit. Bitte Import erneut versuchen.',
    );
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(attachment.mimetype))
    throw new Error(`Nicht unterstütztes Bildformat: ${attachment.mimetype}`);
  if (attachment.data.length > 16 * 1024 * 1024)
    throw new Error('WhatsApp-Bild überschreitet das Uploadlimit von 12 MB.');
  if (!eligible()) return null;
  let sender = message.rawData?.notifyName || message._data?.notifyName || '';
  if (!sender && typeof message.getContact === 'function') {
    try {
      const contact = await message.getContact();
      sender = contact.pushname || contact.name || '';
    } catch {
      /* Name may not be available. */
    }
  }
  if (!eligible()) return null;
  const item = await media.add(Buffer.from(attachment.data, 'base64'), {
    caption: message.body || message.rawData?.caption || message._data?.caption || '',
    hideCaption: groupRule(store.settings(), chatId)?.mode === 'hashtag',
    title: message.body || 'Foto aus WhatsApp',
    source: 'whatsapp',
    pinned: hasPinHashtag(caption, groupRule(store.settings(), chatId)),
    messageId,
    groupId: chatId,
    visible: !store.settings().moderation && !store.get('aiEnabled'),
    sender: senderName(sender),
  });
  if (item && media.review) await media.review(item.id);
  return item;
}
