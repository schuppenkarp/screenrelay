import { rotateImage } from '../rotate-image.js';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { assert, validateItem } from '../validation.js';
import { validateStream } from '../streams.js';
import { adminItem } from '../camera-secrets.js';

export function registerItemsRoutes({ app, store, admin, media, ai, drive }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 2 },
  });
  app.post('/api/items/upload', admin, upload.single('image'), async (req, res) => {
    assert(req.file, 'Bitte ein Bild auswählen.');
    const item = await media.add(req.file.buffer, {
      title: req.file.originalname.replace(/\.[^.]+$/, '').slice(0, 120),
      pinned: req.body.pinned === 'true',
      visible: !ai.enabled(),
    });
    if (item && ai.enabled()) await ai.review(item.id);
    res.status(201).json(store.item(item.id));
  });
  app.post('/api/items/text', admin, (req, res) => {
    assert(
      !store.db.prepare("SELECT id FROM items WHERE type='text' LIMIT 1").get(),
      'Es gibt bereits eine Infotafel. Bitte die bestehende bearbeiten.',
      409,
    );
    const item = validateItem(req.body);
    assert(item.title, 'Bitte einen Titel eingeben.');
    const id = randomUUID();
    store.db
      .prepare(
        `INSERT INTO items (id,type,title,body,source,created,pinned,visible,duration,sort_order,theme) VALUES (?,'text',?,?,'admin',?,?,?,?,?,?)`,
      )
      .run(
        id,
        item.title,
        item.body,
        Date.now(),
        Number(item.pinned),
        Number(item.visible),
        item.duration,
        item.sort_order,
        item.theme,
      );
    res.status(201).json(store.item(id));
  });
  app.patch('/api/items/:id', admin, (req, res) => {
    const previous = store.item(req.params.id);
    assert(previous, 'Inhalt nicht gefunden.', 404);
    const item =
      previous.type === 'stream'
        ? store.protectStream(validateStream(req.body, previous))
        : validateItem(req.body, previous);
    if (req.body.visible === true)
      store.db
        .prepare(
          "UPDATE image_reviews SET status='approved',updated=? WHERE item_id=? AND status='held'",
        )
        .run(Date.now(), previous.id);
    store.db
      .prepare(
        'UPDATE items SET title=?,body=?,pinned=?,visible=?,duration=?,sort_order=?,theme=? WHERE id=?',
      )
      .run(
        item.title,
        item.body,
        Number(item.pinned),
        Number(item.visible),
        item.duration,
        item.sort_order,
        item.theme,
        previous.id,
      );
    void drive.sync();
    if (previous.type === 'stream')
      store.db
        .prepare(
          'UPDATE items SET stream_url=?,stream_kind=?,rotation_visible=?,stream_username=?,stream_password_cipher=? WHERE id=?',
        )
        .run(
          item.stream_url,
          item.stream_kind,
          Number(item.rotation_visible),
          item.stream_username,
          item.stream_password_cipher,
          previous.id,
        );
    res.json(adminItem(store.item(previous.id)));
  });
  app.post('/api/items/:id/rotate', admin, (req, res) => {
    const item = rotateImage(store, req.params.id, req.body.direction);
    void drive.sync();
    res.json(adminItem(item));
  });
  app.delete('/api/items/:id', admin, async (req, res) => {
    await media.remove(req.params.id);
    res.json({ ok: true });
  });
}
