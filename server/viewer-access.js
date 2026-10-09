import { randomBytes, randomUUID } from 'node:crypto';
import { equal } from './auth.js';

// Persist token ownership separately so revoking one monitor leaves the others online.
export function viewerAccess(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS viewer_tokens (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT NOT NULL, created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS viewer_sessions (
    hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,
    token_id TEXT NOT NULL REFERENCES viewer_tokens(id) ON DELETE CASCADE
  );`);
  if (!store.get('viewerTokensMigrated')) {
    store.db
      .prepare('INSERT INTO viewer_tokens VALUES (?,?,?,?)')
      .run('legacy', 'Bisheriger Monitor-Link', store.get('displayToken'), Date.now());
    store.db
      .prepare(
        "INSERT INTO viewer_sessions SELECT hash,'legacy' FROM sessions WHERE role='display'",
      )
      .run();
    store.set('viewerTokensMigrated', true);
  }
  const list = () => store.db.prepare('SELECT * FROM viewer_tokens ORDER BY created,id').all();
  const create = (name) => {
    const row = {
      id: randomUUID(),
      name,
      token: randomBytes(32).toString('hex'),
      created: Date.now(),
    };
    store.db
      .prepare('INSERT INTO viewer_tokens VALUES (?,?,?,?)')
      .run(row.id, row.name, row.token, row.created);
    return row;
  };
  const revoke = (id) => {
    store.db
      .prepare(
        'DELETE FROM sessions WHERE hash IN (SELECT hash FROM viewer_sessions WHERE token_id=?)',
      )
      .run(id);
    store.db.prepare('DELETE FROM viewer_tokens WHERE id=?').run(id);
  };
  return {
    list,
    create,
    revoke,
    find: (token) =>
      typeof token === 'string' ? list().find((row) => equal(row.token, token)) : null,
    path: (row) => `/display?token=${row.token}`,
  };
}
