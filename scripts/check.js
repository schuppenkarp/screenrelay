import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(filename);
      continue;
    }
    if (!/\.(?:js|mjs)$/.test(entry.name)) continue;
    const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
for (const directory of ['server', 'public', 'tests', 'scripts']) checkDirectory(directory);
console.log('JavaScript-Syntax geprüft.');
