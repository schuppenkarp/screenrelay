import { createHash } from 'node:crypto';
import { assert, text, choice, validateItem } from './validation.js';
import { splitCameraUrl } from './camera-secrets.js';

export function validateStream(input, previous = {}) {
  const next = validateItem(input, {
    pinned: true,
    visible: true,
    rotation_visible: true,
    ...previous,
  });
  next.stream_kind = choice(
    input.stream_kind ?? previous.stream_kind ?? 'mjpeg',
    ['mjpeg', 'hls', 'video', 'flv', 'reolink'],
    'Streamformat',
  );
  next.stream_url = text(input.stream_url ?? previous.stream_url, 2000, 'Stream-URL', true);
  let url;
  try {
    const credentials = splitCameraUrl(next.stream_url);
    url = credentials.url;
    next.stream_username = text(
      input.stream_username ?? (credentials.username || previous.stream_username || ''),
      200,
      'Kamerabenutzer',
    );
    next.stream_password_cipher = previous.stream_password_cipher || '';
    const password = input.stream_password || credentials.password;
    assert(password === undefined || typeof password === 'string', 'Ungültiges Kamerapasswort.');
    assert(!password || password.length <= 4096, 'Kamerapasswort zu lang.');
    if (password) next.stream_password = password;
    if (input.clear_stream_password === true) next.stream_password = '';
    next.stream_url = url.href;
  } catch {
    assert(false, 'Ungültige Stream-URL.');
  }
  assert(
    ['http:', 'https:'].includes(url.protocol),
    'Bitte einen HTTP- oder HTTPS-Stream verwenden.',
  );
  assert(!url.hash, 'Stream-URL darf kein Fragment enthalten.');
  if (next.stream_kind === 'reolink') {
    assert(
      next.stream_username &&
        (next.stream_password ||
          (next.stream_password === undefined && next.stream_password_cipher)),
      'Reolink benötigt Benutzername und Passwort in den Anmeldefeldern.',
    );
    assert(
      url.pathname === '/flv' &&
        /^channel\d+_(sub|main|ext)\.bcs$/.test(url.searchParams.get('stream') || ''),
      'Bitte eine Reolink-FLV-URL mit Kanal und Stream angeben.',
    );
    for (const key of ['token', 'user', 'password']) url.searchParams.delete(key);
    next.stream_url = url.href;
  }
  assert(next.title, 'Bitte einen Kameranamen eingeben.');
  return next;
}

export function publicItem(item) {
  const {
    stream_url,
    stream_username,
    stream_password,
    stream_password_cipher,
    original_file,
    original_bytes,
    message_id,
    ...value
  } = item;
  return value;
}

export function touchItems(items, settings) {
  return (settings.touchItemIds || [])
    .map((id) => items.find((item) => item.id === id && item.visible && item.pinned))
    .filter(Boolean)
    .map(publicItem);
}

export function rewritePlaylist(source, url, root, register) {
  assert(source.startsWith('#EXTM3U'), 'Keine gültige HLS-Wiedergabeliste.', 502);
  const rewrite = (value) => {
    const resolved = new URL(value, url);
    assert(
      resolved.origin === root.origin,
      'HLS-Unterdateien müssen auf demselben Kameraserver liegen.',
      502,
    );
    return register(resolved.href);
  };
  return source
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith('#'))
        return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewrite(uri)}"`);
      return rewrite(line.trim());
    })
    .join('\n');
}

export function streamAssets() {
  const assets = new Map();
  return {
    register(id, url) {
      for (const [key, value] of assets) if (value.expires < Date.now()) assets.delete(key);
      const key = createHash('sha256')
        .update(id + '\0' + url)
        .digest('hex');
      assets.set(key, { id, url, expires: Date.now() + 10 * 60_000 });
      while (assets.size > 6000) assets.delete(assets.keys().next().value);
      return `/api/streams/${id}/asset/${key}`;
    },
    get(id, key) {
      const entry = assets.get(key);
      return entry?.id === id && entry.expires > Date.now() ? entry.url : null;
    },
  };
}
