import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { cameraSecrets, splitCameraUrl } from './camera-secrets.js';

export const defaults = {
  title: 'Bilderwand',
  photoDuration: 10,
  pinDuration: 20,
  pinInterval: 5,
  transition: 'fade',
  transitionDuration: 800,
  fit: 'contain',
  moderation: false,
  showCaptions: true,
  retentionDays: 30,
  minimumPhotos: 10,
  maximumPhotos: 50,
  photosPerScreen: 4,
  layoutColumns: 2,
  layoutRows: 2,
  layoutGap: 16,
  layoutPadding: 16,
  layoutLeftPercent: 50,
  noticePosition: 'top-right',
  portraitFeature: true,
  touchEnabled: false,
  touchDuration: 60,
  touchColumns: 2,
  touchItemIds: [],
  groupId: '',
  groupName: '',
  whatsappEnabled: false,
};

export function openStore(dataDir) {
  mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  mkdirSync(path.join(dataDir, 'originals'), { recursive: true });
  mkdirSync(path.join(dataDir, 'deleted'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'wall.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, role TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts (message_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, reacted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      file TEXT, source TEXT NOT NULL, message_id TEXT UNIQUE, created INTEGER NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1,
      duration INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, theme TEXT NOT NULL DEFAULT 'forest',
      bytes INTEGER NOT NULL DEFAULT 0
    );`);
  const columns = db
    .prepare('PRAGMA table_info(items)')
    .all()
    .map((row) => row.name);
  for (const [name, type] of [
    ['sender', "TEXT NOT NULL DEFAULT ''"],
    ['width', 'INTEGER'],
    ['height', 'INTEGER'],
    ['crop_focus', 'TEXT'],
    ['hide_caption', 'INTEGER'],
    ['rotation_manual', 'INTEGER NOT NULL DEFAULT 0'],
    ['display_rotation', 'INTEGER NOT NULL DEFAULT 0'],
    ['stream_url', "TEXT NOT NULL DEFAULT ''"],
    ['stream_kind', "TEXT NOT NULL DEFAULT 'mjpeg'"],
    ['stream_username', "TEXT NOT NULL DEFAULT ''"],
    ['stream_password_cipher', "TEXT NOT NULL DEFAULT ''"],
    ['rotation_visible', 'INTEGER NOT NULL DEFAULT 1'],
  ]) {
    if (!columns.includes(name)) db.exec(`ALTER TABLE items ADD COLUMN ${name} ${type}`);
  }
  db.exec(
    'CREATE TABLE IF NOT EXISTS archived_items (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, bytes INTEGER NOT NULL, deleted INTEGER NOT NULL)',
  );
  db.exec(`CREATE TABLE IF NOT EXISTS image_reviews (
    item_id TEXT PRIMARY KEY, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
    reacted INTEGER NOT NULL DEFAULT 0, replied INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL
  )`);
  for (const [name, type] of [
    ['original_file', 'TEXT'],
    ['original_bytes', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!columns.includes(name)) db.exec(`ALTER TABLE items ADD COLUMN ${name} ${type}`);
  }
  const archivedRows = db.prepare('SELECT id,metadata FROM archived_items').all();
  const secrets = cameraSecrets(
    dataDir,
    Boolean(db.prepare("SELECT 1 FROM items WHERE stream_password_cipher<>'' LIMIT 1").get()) ||
      archivedRows.some((row) => JSON.parse(row.metadata).stream_password_cipher),
  );
  let migrated = false;
  db.exec('PRAGMA secure_delete=ON');
  for (const row of db.prepare("SELECT * FROM items WHERE type='stream'").all()) {
    const credentials = splitCameraUrl(row.stream_url);
    if (credentials.url.href !== row.stream_url || credentials.password) {
      db.prepare(
        'UPDATE items SET stream_url=?,stream_username=?,stream_password_cipher=? WHERE id=?',
      ).run(
        credentials.url.href,
        credentials.username || row.stream_username,
        credentials.password ? secrets.encrypt(credentials.password) : row.stream_password_cipher,
        row.id,
      );
      migrated = true;
    }
  }
  for (const row of archivedRows) {
    const item = JSON.parse(row.metadata);
    if (item.type !== 'stream' || !item.stream_url) continue;
    const credentials = splitCameraUrl(item.stream_url);
    if (credentials.url.href === item.stream_url && !credentials.password) continue;
    item.stream_url = credentials.url.href;
    item.stream_username = credentials.username || item.stream_username || '';
    item.stream_password_cipher = credentials.password
      ? secrets.encrypt(credentials.password)
      : item.stream_password_cipher || '';
    db.prepare('UPDATE archived_items SET metadata=? WHERE id=?').run(JSON.stringify(item), row.id);
    const archivedFile = path.join(dataDir, 'deleted', `${row.id}.json`);
    if (/^[a-f0-9-]{36}$/i.test(row.id) && existsSync(archivedFile))
      writeFileSync(archivedFile, JSON.stringify(item));
    migrated = true;
  }
  if (migrated) {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  }
  const get = (key) => {
    const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : undefined;
  };
  const set = (key, value) =>
    db
      .prepare(
        'INSERT INTO config VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value));
  if (!get('displayToken')) set('displayToken', randomBytes(32).toString('hex'));
  const settings = () => ({
    ...defaults,
    ...get('settings'),
    knownGroups: get('knownGroups') || [],
  });
  const items = () =>
    db.prepare('SELECT * FROM items ORDER BY sort_order, created, id').all().map(serialize);
  const item = (id) => {
    const row = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    return row && serialize(row);
  };
  return {
    db,
    get,
    set,
    settings,
    items,
    item,
    cameraPassword: (item) => secrets.decrypt(item.stream_password_cipher),
    protectStream: (item) => ({
      ...item,
      stream_password: undefined,
      stream_password_cipher:
        item.stream_password === undefined
          ? item.stream_password_cipher || ''
          : secrets.encrypt(item.stream_password),
    }),
    close: () => db.close(),
  };
}

function serialize(row) {
  return {
    ...row,
    pinned: Boolean(row.pinned),
    visible: Boolean(row.visible),
    rotation_visible: Boolean(row.rotation_visible),
    url:
      row.type === 'stream'
        ? `/api/streams/${row.id}/live`
        : row.file
          ? `/media/${row.file}${row.display_rotation ? '?r=' + row.display_rotation : ''}`
          : null,
  };
}
