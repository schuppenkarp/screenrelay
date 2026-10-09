import { selectedGroupIds, selectedGroupsSql } from './selected-groups.js';
import { organization } from './organization.js';
import { normalizeMessageId } from './message-id.js';

export function holdImage(store, id, reason) {
  const item = store.item(id);
  if (!item) return false;
  store.db.exec('BEGIN');
  try {
    store.db
      .prepare(
        `INSERT INTO image_reviews (item_id,status,reason,updated) VALUES (?,'held',?,?)
      ON CONFLICT(item_id) DO UPDATE SET status='held',reason=excluded.reason,updated=excluded.updated`,
      )
      .run(id, reason, Date.now());
    store.db.prepare('UPDATE items SET visible=0 WHERE id=?').run(id);
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export async function notifyHeld(message, store) {
  const id = normalizeMessageId(message);
  const review = store.db
    .prepare(
      `SELECT image_reviews.* FROM image_reviews JOIN items ON items.id=image_reviews.item_id
    WHERE items.message_id=? AND image_reviews.status='held'`,
    )
    .get(id);
  if (!review) return false;
  if (!review.reacted) {
    await message.react('❓');
    store.db.prepare('UPDATE image_reviews SET reacted=1 WHERE item_id=?').run(review.item_id);
  }
  if (!review.replied) {
    await message.reply(organization(store).aiHeldMessage);
    store.db.prepare('UPDATE image_reviews SET replied=1 WHERE item_id=?').run(review.item_id);
  }
  store.db.prepare('UPDATE receipts SET reacted=1 WHERE message_id=?').run(id);
  return true;
}

export function approveByReaction(reaction, store) {
  if (reaction.reaction?.replace(/\uFE0F/g, '') !== '✅') return false;
  const settings = store.settings();
  if (!settings.whatsappEnabled || !selectedGroupIds(settings).length) return false;
  let id;
  try {
    id = normalizeMessageId({ id: reaction.msgId });
  } catch {
    return false;
  }
  const item = store.db
    .prepare(
      `SELECT items.id FROM items JOIN receipts ON receipts.message_id=items.message_id
    JOIN image_reviews ON image_reviews.item_id=items.id
    WHERE items.message_id=? AND receipts.group_id IN (SELECT value FROM json_each(?)) AND image_reviews.status='held'`,
    )
    .get(id, selectedGroupsSql(settings));
  if (!item) return false;
  store.db.exec('BEGIN');
  try {
    store.db
      .prepare("UPDATE image_reviews SET status='approved',updated=? WHERE item_id=?")
      .run(Date.now(), item.id);
    store.db.prepare('UPDATE items SET visible=1 WHERE id=?').run(item.id);
    store.db.prepare('UPDATE receipts SET reacted=1 WHERE message_id=?').run(id);
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
  return true;
}
