import { selectedGroupIds, selectedGroupsSql } from './selected-groups.js';
import { normalizeMessageId } from './message-id.js';

export function updateImageCaption(message, body, store) {
  const settings = store.settings();
  if (!settings.whatsappEnabled || !selectedGroupIds(settings).length || typeof body !== 'string')
    return false;
  const id = normalizeMessageId(message);
  const item = store.db
    .prepare(
      `SELECT items.id FROM items JOIN receipts ON receipts.message_id=items.message_id
    WHERE items.message_id=? AND receipts.group_id IN (SELECT value FROM json_each(?)) AND items.source='whatsapp' AND items.type='image'`,
    )
    .get(id, selectedGroupsSql(settings));
  if (!item) return false;
  store.db
    .prepare('UPDATE items SET body=?,title=? WHERE id=?')
    .run(body.slice(0, 1200), body.trim().slice(0, 120) || 'Foto aus WhatsApp', item.id);
  return true;
}
