import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { viewerAccess } from './viewer-access.js';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
export const equal = (a, b) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password, hash) {
  const [salt, expected] = hash.split(':');
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
export function authService(store, secure) {
  const viewers = viewerAccess(store);
  store.db
    .prepare("UPDATE sessions SET expires=? WHERE role='display'")
    .run(Number.MAX_SAFE_INTEGER);
  const options = { httpOnly: true, secure, sameSite: 'strict', path: '/' };
  store.db.exec(`CREATE TABLE IF NOT EXISTS session_identities (
    hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,
    subject TEXT NOT NULL, name TEXT NOT NULL, revision TEXT NOT NULL
  )`);
  const create = (res, role, identity = null) => {
    const token = randomBytes(32).toString('hex');
    const maxAge = role !== 'display' ? 12 * 3600_000 : 400 * 24 * 3600_000;
    store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    store.db
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(digest(token), role, role === 'display' ? Number.MAX_SAFE_INTEGER : Date.now() + maxAge);
    if (role === 'display' && identity?.tokenId) {
      store.db
        .prepare('INSERT INTO viewer_sessions VALUES (?,?)')
        .run(digest(token), identity.tokenId);
    }
    if (role === 'entra') {
      store.db
        .prepare('INSERT INTO session_identities VALUES (?,?,?,?)')
        .run(digest(token), identity.subject, identity.name, identity.revision);
    }
    res.cookie(role !== 'display' ? 'wall_admin' : 'wall_display', token, { ...options, maxAge });
  };
  const tokens = (req) =>
    Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split('=')));
  const identity = (req) => {
    const cookies = tokens(req);
    for (const name of ['wall_admin', 'wall_display']) {
      if (!cookies[name]) continue;
      const session = store.db
        .prepare('SELECT role,hash FROM sessions WHERE hash=? AND expires>?')
        .get(digest(cookies[name]), Date.now());
      if (!session) continue;
      if (
        session.role === 'display' &&
        !store.db.prepare('SELECT hash FROM viewer_sessions WHERE hash=?').get(session.hash)
      )
        continue;
      if (session.role === 'entra') {
        const user = store.db
          .prepare('SELECT subject,name,revision FROM session_identities WHERE hash=?')
          .get(session.hash);
        const config = store.get('entra');
        if (
          !user ||
          !config?.enabled ||
          user.revision !== config.revision ||
          !config.users.some((entry) => entry.oid === user.subject)
        )
          continue;
        return { role: 'admin', provider: 'entra', name: user.name, subject: user.subject };
      }
      return {
        role: session.role,
        provider: session.role === 'admin' ? 'master' : 'display',
        name: session.role === 'admin' ? 'Master-Administrator' : 'Monitor',
      };
    }
    return null;
  };
  const role = (req) => identity(req)?.role || null;
  const clear = (req, res) => {
    for (const name of ['wall_admin', 'wall_display']) {
      const token = tokens(req)[name];
      if (token) store.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));
      res.clearCookie(name, options);
    }
  };
  const refreshViewer = (req, res) => {
    const token = tokens(req).wall_display;
    if (
      token &&
      store.db
        .prepare("SELECT hash FROM sessions WHERE hash=? AND role='display'")
        .get(digest(token))
    )
      res.cookie('wall_display', token, { ...options, maxAge: 400 * 24 * 3600_000 });
  };
  return { create, role, identity, clear, viewers, refreshViewer };
}
