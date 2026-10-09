import { createHash } from 'node:crypto';
import { assert } from './validation.js';
import { normalizeMessageId } from './message-id.js';
import { selectedGroupsSql } from './selected-groups.js';

export function rotateImage(store, id, direction) {
  assert(direction === 'left' || direction === 'right', 'Ungültige Drehrichtung.');
  const item = store.item(id);
  assert(item?.type === 'image', 'Bild nicht gefunden.', 404);
  const rotation = ((item.display_rotation || 0) + (direction === 'left' ? 270 : 90)) % 360;
  // Keep original pixels; invalidate an AI crop because its coordinates no longer match.
  store.db
    .prepare('UPDATE items SET display_rotation=?,rotation_manual=1,crop_focus=NULL WHERE id=?')
    .run(rotation, id);
  return store.item(id);
}

export function rotateByReaction(reaction, store, active = () => true) {
  if (!active() || !store.settings().whatsappEnabled) return false;
  const emoji = reaction.reaction?.replace(/\uFE0F/g, '');
  if (!['↩', '↪'].includes(emoji)) return false;
  let messageId;
  try {
    messageId = normalizeMessageId({ id: reaction.msgId });
  } catch {
    return false;
  }
  const item = store.db
    .prepare(
      `SELECT items.id FROM items JOIN receipts ON receipts.message_id=items.message_id
    WHERE items.message_id=? AND receipts.group_id IN (SELECT value FROM json_each(?))
    AND items.source='whatsapp' AND items.type='image'`,
    )
    .get(messageId, selectedGroupsSql(store.settings()));
  if (!item || !active()) return false;
  // Replayed WhatsApp events must not rotate a second time after reconnecting.
  if (!reaction.senderId || !Number.isFinite(reaction.timestamp)) return false;
  const key = createHash('sha256')
    .update(JSON.stringify([messageId, reaction.senderId, reaction.timestamp, emoji]))
    .digest('hex');
  store.db.exec('CREATE TABLE IF NOT EXISTS rotation_reactions (event TEXT PRIMARY KEY)');
  store.db.exec('BEGIN');
  try {
    const inserted = store.db
      .prepare('INSERT OR IGNORE INTO rotation_reactions VALUES (?)')
      .run(key);
    if (!inserted.changes) {
      store.db.exec('ROLLBACK');
      return false;
    }
    rotateImage(store, item.id, emoji === '↩' ? 'left' : 'right');
    store.db.exec('COMMIT');
    return true;
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}
