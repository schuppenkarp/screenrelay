import { execFileSync } from 'node:child_process';
import { createReadStream, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const output = path.resolve(process.argv[2] || '');
const releases = path.resolve('releases') + path.sep;
if (
  !output.startsWith(releases) ||
  !path.basename(output).startsWith('private-deployment-') ||
  !existsSync(path.join(output, 'private-data.tar.gz'))
)
  throw Error('Pass a private deployment directory from the snapshot script.');
execFileSync(
  'docker',
  ['image', 'save', '--output', path.join(output, 'wallrelay-image.tar'), 'wallrelay:deploy'],
  { stdio: 'inherit' },
);
const log = execFileSync(process.execPath, ['scripts/package-release.js'], { encoding: 'utf8' });
const source = log.trim().split(/\r?\n/).at(-1);
if (!path.resolve(source).startsWith(releases)) throw Error('Unexpected source export path.');
const archive = source + '.tar.gz';
execFileSync('tar', ['-czf', archive, '-C', source, '.'], { stdio: 'inherit' });
copyFileSync(archive, path.join(output, 'neutral-source.tar.gz'));
const files = [
  'private-data.tar.gz',
  'wallrelay-image.tar',
  'neutral-source.tar.gz',
  'compose.proxy.yaml',
  'scripts/install-docker-package.ps1',
  'scripts/configure-migrated-data.js',
  'scripts/import-docker-data.sh',
  'INSTALLATION.md',
];
const manifest = [];
for (const file of files) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path.join(output, file))) hash.update(bytes);
  manifest.push({ file, sha256: hash.digest('hex') });
}
writeFileSync(
  path.join(output, 'DEPLOYMENT-SHA256.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(JSON.stringify({ privatePackage: output, publicSource: archive }));
