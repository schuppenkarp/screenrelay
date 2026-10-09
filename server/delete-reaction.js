import { selectedGroupIds, selectedGroupsSql } from './selected-groups.js';
import { normalizeMessageId } from './message-id.js';

export async function deleteByReaction(reaction, store, media, active = () => true) {
  if (!active() || reaction.reaction?.replace(/\uFE0F/g, '') !== '❌') return false;
  const settings = store.settings();
  if (!settings.whatsappEnabled || !selectedGroupIds(settings).length) return false;
  let messageId;
  try {
    messageId = normalizeMessageId({ id: reaction.msgId });
  } catch {
    return false;
  }
  // Only imported photos whose receipt belongs to the selected group qualify.
  const item = store.db
    .prepare(
      `SELECT items.id FROM items JOIN receipts ON receipts.message_id=items.message_id
    WHERE items.message_id=? AND receipts.group_id IN (SELECT value FROM json_each(?)) AND items.source='whatsapp' AND items.type='image'`,
    )
    .get(messageId, selectedGroupsSql(settings));
  if (!item || !active()) return false;
  await media.remove(item.id);
  // Preserve the receipt to prevent a later replay from importing this photo again.
  store.db.prepare('UPDATE receipts SET reacted=1 WHERE message_id=?').run(messageId);
  return true;
}
