import { unlinkSync } from 'node:fs';
// Called only by the updater after the application container has stopped.
for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
  try {
    unlinkSync('/app/data/whatsapp/session/' + name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
