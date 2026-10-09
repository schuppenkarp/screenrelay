import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Private local encryption key; back up alongside the database, never publish it.
export function entraSecrets(dataDir, hasSecret) {
  const file = path.join(dataDir, 'entra-secrets.key');
  if (!existsSync(file)) {
    if (hasSecret) throw new Error('Entra-Schlüssel fehlt. entra-secrets.key wiederherstellen.');
    writeFileSync(file, randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  const key = readFileSync(file);
  if (key.length !== 32) throw new Error('Ungültiger Entra-Schlüssel.');
  return {
    encrypt(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [
        'v1',
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        bytes.toString('base64'),
      ].join('.');
    },
    decrypt(value) {
      const [version, iv, tag, bytes] = value.split('.');
      if (version !== 'v1') throw new Error('Ungültiges Entra-Geheimnis.');
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      cipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([cipher.update(Buffer.from(bytes, 'base64')), cipher.final()]).toString(
        'utf8',
      );
    },
  };
}
