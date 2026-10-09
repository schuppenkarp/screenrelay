import sharp from 'sharp';
import { writeFile, unlink, copyFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assert } from './validation.js';
import { displayItems } from './retention.js';

export async function localMediaBytes(dataDir) {
  let total = 0;
  for (const folder of ['media', 'originals', 'deleted'])
    for (const name of await readdir(path.join(dataDir, folder))) {
      try {
        const info = await stat(path.join(dataDir, folder, name));
        if (info.isFile()) total += info.size;
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  return total;
}

export function mediaService(store, dataDir, maxStorageMB = 1024) {
  let queue = Promise.resolve();
  const add = async (
    buffer,
    {
      title,
      source = 'upload',
      messageId = null,
      groupId = null,
      pinned = false,
      visible = true,
      sender = '',
      caption = '',
      hideCaption = false,
    } = {},
  ) => {
    assert(
      Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= 12 * 1024 * 1024,
      'Das Bild darf maximal 12 MB groß sein.',
    );
    if (
      messageId &&
      store.db.prepare('SELECT message_id FROM receipts WHERE message_id=?').get(messageId)
    )
      return null;
    let encoded, format;
    try {
      const sourceImage = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
      const metadata = await sourceImage.metadata();
      format = metadata.format;
      assert(['jpeg', 'png', 'webp'].includes(metadata.format), 'Erlaubt sind JPG, PNG und WebP.');
      encoded = await sourceImage
        .rotate()
        .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch {
      throw new Error(
        'Bild nicht lesbar. Bitte JPG, PNG oder WebP mit maximal 40 Megapixeln verwenden.',
      );
    }
    const bytes = await localMediaBytes(dataDir);
    assert(
      bytes + encoded.length + buffer.length <= maxStorageMB * 1024 * 1024,
      'Lokales Speicherlimit erreicht. Bitte Drive-Sicherung prüfen oder Speicher erweitern.',
      413,
    );
    const id = randomUUID(),
      file = `${id}.jpg`;
    const originalFile = `${id}.original.${format === 'jpeg' ? 'jpg' : format}`;
    const dimensions = await sharp(encoded).metadata();
    await writeFile(path.join(dataDir, 'media', file), encoded, { flag: 'wx' });
    try {
      await writeFile(path.join(dataDir, 'originals', originalFile), buffer, { flag: 'wx' });
      store.db.exec('BEGIN');
      store.db
        .prepare(
          `INSERT INTO items (id,type,title,file,source,message_id,created,pinned,visible,bytes)
        VALUES (?,'image',?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          String(title || 'Neues Foto').slice(0, 120),
          file,
          source,
          messageId,
          Date.now(),
          Number(pinned),
          Number(visible),
          encoded.length,
        );
      if (messageId && groupId)
        store.db
          .prepare('INSERT INTO receipts (message_id,group_id) VALUES (?,?)')
          .run(messageId, groupId);
      store.db
        .prepare('UPDATE items SET sender=?,width=?,height=? WHERE id=?')
        .run(String(sender).slice(0, 160), dimensions.width, dimensions.height, id);
      store.db
        .prepare('UPDATE items SET body=?,hide_caption=? WHERE id=?')
        .run(String(caption).slice(0, 1200), Number(hideCaption), id);
      store.db
        .prepare('UPDATE items SET original_file=?,original_bytes=? WHERE id=?')
        .run(originalFile, buffer.length, id);
      store.db.exec('COMMIT');
    } catch (error) {
      try {
        store.db.exec('ROLLBACK');
      } catch {}
      await unlink(path.join(dataDir, 'media', file)).catch(() => {});
      await unlink(path.join(dataDir, 'originals', originalFile)).catch(() => {});
      throw error;
    }
    return store.item(id);
  };
  const service = {
    evictInactiveOriginal: (id) => {
      const result = queue.then(async () => {
        const item = store.item(id);
        if (
          !item?.original_file ||
          displayItems(store.items(), store.settings()).some((i) => i.id === id)
        )
          return;
        await unlink(path.join(dataDir, 'originals', item.original_file)).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
      });
      queue = result.catch(() => {});
      return result;
    },
    add: (buffer, options) => {
      const result = queue.then(() => add(buffer, options));
      queue = result.catch(() => {});
      return result.then((item) => {
        service.changed?.();
        return item;
      });
    },
    remove: (id) => {
      const result = queue.then(async () => {
        const item = store.item(id);
        assert(item, 'Inhalt nicht gefunden.', 404);
        await service.ensureLocal?.(item);
        const files = [
          [item.file, 'media'],
          [item.original_file, 'originals'],
        ].filter(([file]) => file);
        for (const [file, folder] of files) {
          assert(path.basename(file) === file, 'Ungültiger Dateipfad.');
          await copyFile(path.join(dataDir, folder, file), path.join(dataDir, 'deleted', file));
        }
        const deleted = Date.now(),
          metadata = JSON.stringify({ ...item, deleted });
        await writeFile(path.join(dataDir, 'deleted', `${item.id}.json`), metadata);
        store.db.exec('BEGIN');
        try {
          store.db
            .prepare('INSERT INTO archived_items VALUES (?,?,?,?)')
            .run(id, metadata, item.bytes + item.original_bytes, deleted);
          store.db.prepare('DELETE FROM items WHERE id=?').run(id);
          store.db.exec('COMMIT');
        } catch (error) {
          store.db.exec('ROLLBACK');
          throw error;
        }
        for (const [file, folder] of files)
          await unlink(path.join(dataDir, folder, file)).catch(() => {});
        service.changed?.();
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  return service;
}
