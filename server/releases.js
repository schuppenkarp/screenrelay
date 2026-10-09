export const repository = 'schuppenkarp/screenrelay';
export const validVersion = (value) => /^v\d+\.\d+\.\d+$/.test(value);
export const newerVersion = (a, b) => {
  const left = a.replace(/^v/, '').split('.').map(Number);
  const right = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
};
export async function releaseInfo(version = 'latest', request = fetch) {
  if (version !== 'latest' && !validVersion(version)) throw new Error('Ungültige Version.');
  const response = await request(
    `https://api.github.com/repos/${repository}/releases/${version === 'latest' ? 'latest' : `tags/${version}`}`,
    {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error('Veröffentlichung derzeit nicht abrufbar.');
  const release = await response.json();
  if (release.draft || release.prerelease || !validVersion(release.tag_name))
    throw new Error('Keine stabile Veröffentlichung.');
  return {
    version: release.tag_name,
    notes: String(release.body || '').slice(0, 20000),
    url: `https://github.com/${repository}/releases/tag/${release.tag_name}`,
  };
}
