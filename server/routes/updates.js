import { releaseInfo, newerVersion } from '../releases.js';

export function registerUpdateRoutes({ app, admin, version }) {
  let release,
    checked = 0,
    error = '';
  app.get('/api/updates', admin, async (req, res) => {
    if (!checked || Date.now() - checked > 60000) {
      try {
        release = await releaseInfo();
        error = '';
      } catch (cause) {
        error = cause.message;
      }
      checked = Date.now();
    }
    res.json({
      installed: version,
      release,
      error,
      updateAvailable: Boolean(release && newerVersion(release.version, version)),
    });
  });
}
