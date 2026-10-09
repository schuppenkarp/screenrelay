import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// Check the files that Git would publish, never private runtime data.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const privatePath =
  /^(data\/|backups\/|releases\/|public\/assets\/brand\/|node_modules\/|\.env(?:$|\.)|\.wwebjs_|test-results\/)|\.(sqlite(?:-wal|-shm)?|pem|key|tar\.gz|zip)$/;
const privateScript =
  /scripts\/(update-board-notice|complete-notice-contacts|extend-notice-programmes|align-board-phone)\.mjs$/;
const credentials =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}|"refresh_token"\s*:\s*"(?!test|fake|private-)[^"]{30,}"/;
const problems = [];
// Optional local audit terms are intentionally excluded from the repository.
const privateTerms = existsSync('data/release-blocklist.json')
  ? JSON.parse(readFileSync('data/release-blocklist.json', 'utf8'))
  : [];
for (const file of files) {
  const allContent = readFileSync(file).toString('utf8').toLowerCase();
  if (privateTerms.some((term) => term && allContent.includes(String(term).toLowerCase())))
    problems.push('Lokaler Organisationsbezug: ' + file);
  if ((file !== '.env.example' && privatePath.test(file)) || privateScript.test(file))
    problems.push('Private Datei: ' + file);
  if (/\.(?:js|mjs|json|md|ya?ml|env)$/.test(file) && file !== 'scripts/check-release.js') {
    const source = readFileSync(file, 'utf8');
    if (credentials.test(source)) problems.push('Mögliche Zugangsdaten: ' + file);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Git-Veröffentlichungsumfang geprüft: ${files.length} Dateien, keine erkannten Laufzeitdaten oder Zugangsschlüssel.`,
  );
