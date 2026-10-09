import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function cameraSecrets(dataDir, hasEncryptedValues = false) {
  const keyPath = path.join(dataDir, 'camera-secrets.key');
  if (!existsSync(keyPath)) {
    if (hasEncryptedValues)
      throw new Error(
        'Kamera-Schlüssel fehlt. camera-secrets.key aus dem Backup wiederherstellen.',
      );
    writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Ungültiger Kamera-Schlüssel.');
  return {
    encrypt(value) {
      if (!value) return '';
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [
        'v1',
        nonce.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        data.toString('base64'),
      ].join('.');
    },
    decrypt(value) {
      if (!value) return '';
      const [version, nonce, tag, data] = value.split('.');
      if (version !== 'v1') throw new Error('Ungültiges Kamera-Geheimnis.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

export function splitCameraUrl(value) {
  const url = new URL(value);
  const username =
    decodeURIComponent(url.username) ||
    url.searchParams.get('user') ||
    url.searchParams.get('username') ||
    '';
  const password =
    decodeURIComponent(url.password) ||
    url.searchParams.get('password') ||
    url.searchParams.get('pass') ||
    '';
  url.username = '';
  url.password = '';
  for (const key of ['user', 'username', 'password', 'pass']) url.searchParams.delete(key);
  return { url, username, password };
}

export function adminItem(item) {
  if (!item) return item;
  const { stream_password_cipher, stream_password, ...safe } = item;
  return { ...safe, stream_password_set: Boolean(stream_password_cipher) };
}
