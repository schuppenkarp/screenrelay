import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
const directory = process.env.DATA_DIR || '/app/data';
const origin = new URL(process.env.PUBLIC_ORIGIN);
if (
  origin.protocol !== 'https:' ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
)
  throw Error('Invalid PUBLIC_ORIGIN');
const db = new DatabaseSync(path.join(directory, 'wall.sqlite'));
try {
  db.exec('BEGIN');
  const row = db.prepare("SELECT value FROM config WHERE key='entra'").get();
  if (row) {
    const config = JSON.parse(row.value);
    config.origin = origin.origin;
    config.revision = randomUUID();
    db.prepare("UPDATE config SET value=? WHERE key='entra'").run(JSON.stringify(config));
  }
  // Browser sessions are host-specific; account configuration and master password remain intact.
  db.prepare('DELETE FROM sessions').run();
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_identities'").get()
  )
    db.prepare('DELETE FROM session_identities').run();
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='entra_flows'").get())
    db.prepare('DELETE FROM entra_flows').run();
  db.exec('COMMIT');
} finally {
  db.close();
}
// Chromium process locks refer to the stopped source computer, not the new container.
for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket'])
  rmSync(path.join(directory, 'whatsapp', 'session', name), { force: true });
console.log('Migration configured. Private users, keys, media and WhatsApp profile retained.');
