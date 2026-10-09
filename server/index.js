import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app.js';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const instance = createApp({
  organizationPreset: process.env.ORGANIZATION_PRESET || 'neutral',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  secure: process.env.COOKIE_SECURE === 'true',
  production: process.env.NODE_ENV === 'production',
  setupKey: process.env.SETUP_KEY || '',
  publicOrigin: process.env.PUBLIC_ORIGIN || '',
  trustProxy: process.env.TRUST_PROXY === 'true',
  maxStorageMB: Number(process.env.MAX_STORAGE_MB || 1024),
});
const server = instance.app.listen(port, host, () =>
  console.log(`Bilderwand: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`),
);
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await instance.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// Only the local parent supervisor can send this IPC message.
process.on('message', (message) => {
  if (message === 'shutdown') void shutdown();
});
