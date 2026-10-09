import { organization } from '../organization.js';
import { displayItems } from '../retention.js';
import { localMediaBytes } from '../media.js';
import { validateSettings } from '../validation.js';
import { adminItem } from '../camera-secrets.js';

export function registerAdminRoutes({ app, store, admin, whatsapp, drive, dataDir, maxStorageMB }) {
  app.get('/api/admin/state', admin, async (req, res) => {
    const items = store.items(),
      settings = store.settings();
    const active = new Set(displayItems(items, settings).map((item) => item.id));
    const unbounded = new Set(
      displayItems(items, { ...settings, maximumPhotos: 0 }).map((item) => item.id),
    );
    res.json({
      organization: organization(store),
      settings,
      items: items.map((item) => ({
        ...adminItem(item),
        review: store.db
          .prepare('SELECT status,reason FROM image_reviews WHERE item_id=?')
          .get(item.id),
        expired: item.visible && !active.has(item.id),
        limited: unbounded.has(item.id) && !active.has(item.id),
      })),
      whatsapp: whatsapp.state(),
      storage: { used: await localMediaBytes(dataDir), max: maxStorageMB * 1024 * 1024 },
    });
  });
  app.put('/api/settings', admin, (req, res) => {
    const settings = validateSettings(req.body, store.settings());
    store.set('settings', settings);
    void drive.sync();
    res.json(settings);
  });
}
