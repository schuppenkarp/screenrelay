import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';

// Run only after stopping the source. This output is PRIVATE, unlike package-release.js.
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
if (existsSync(path.join(dataDir, 'managed-server.json')))
  throw Error('Stop the managed source server before packaging.');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('releases', 'private-deployment-' + stamp);
mkdirSync(path.join(output, 'scripts'), { recursive: true });
const entries = [
  'wall.sqlite',
  'wall.sqlite-wal',
  'wall.sqlite-shm',
  'branding',
  'media',
  'originals',
  'deleted',
  'whatsapp',
  'whatsapp-cache',
  'camera-secrets.key',
  'entra-secrets.key',
  'openai-key',
  'gemini-key',
  'openrouter-key',
  'google-drive.json',
].filter((name) => existsSync(path.join(dataDir, name)));
if (!entries.includes('wall.sqlite')) throw Error('Source database missing.');
execFileSync('tar', ['-czf', path.join(output, 'private-data.tar.gz'), '-C', dataDir, ...entries], {
  stdio: 'inherit',
});
copyFileSync('compose.proxy.yaml', path.join(output, 'compose.proxy.yaml'));
for (const name of [
  'install-docker-package.ps1',
  'configure-migrated-data.js',
  'import-docker-data.sh',
])
  copyFileSync(path.join('scripts', name), path.join(output, 'scripts', name));
copyFileSync('docs/external-proxy.md', path.join(output, 'INSTALLATION.md'));
const sourceEnv = existsSync('.env') ? parse(readFileSync('.env')) : {};
const env = {
  PUBLIC_ORIGIN: '',
  PORT: '8045',
  BIND_ADDRESS: '0.0.0.0',
  SETUP_KEY: randomBytes(24).toString('hex'),
  MAX_STORAGE_MB: sourceEnv.MAX_STORAGE_MB || '1024',
};
for (const name of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY'])
  if (sourceEnv[name]) env[name] = sourceEnv[name];
writeFileSync(
  path.join(output, '.env'),
  '# Private deployment configuration. Set HTTPS origin using the installer.\n' +
    Object.entries(env)
      .map(([key, value]) => key + '=' + JSON.stringify(value.replaceAll('$', '$$')))
      .join('\n') +
    '\n',
  { mode: 0o600 },
);
writeFileSync(
  path.join(output, 'PRIVATE-NOTICE.txt'),
  'PRIVATE: Contains account credentials, personal data and WhatsApp session. Never publish this directory. The source system was restarted after this snapshot; take a fresh snapshot for final cutover.\n',
);
// Image save is handled separately so the source can restart immediately after its snapshot.
console.log(output);
