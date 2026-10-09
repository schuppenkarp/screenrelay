import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Export only files that Git would publish, never the workspace or its history wholesale.
execFileSync(process.execPath, ['scripts/check-release.js'], { stdio: 'inherit' });
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const root = path.resolve(
  'releases',
  'wallrelay-' + new Date().toISOString().replace(/[:.]/g, '-'),
);
mkdirSync(root, { recursive: true });
const manifest = [];
for (const file of files) {
  const destination = path.resolve(root, file);
  if (!destination.startsWith(root + path.sep)) throw new Error('Invalid export path');
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(file, destination);
  manifest.push({
    file,
    sha256: createHash('sha256').update(readFileSync(destination)).digest('hex'),
  });
}
writeFileSync(path.join(root, 'RELEASE-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(root);
