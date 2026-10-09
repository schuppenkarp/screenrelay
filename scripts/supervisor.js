import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdirSync,
  existsSync,
  statSync,
  renameSync,
  openSync,
  closeSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
const dataDir = path.resolve(process.env.DATA_DIR || './data');
mkdirSync(dataDir, { recursive: true });
const stateFile = path.join(dataDir, 'managed-server.json');
const stopFile = path.join(dataDir, 'managed-server.stop');
const port = Number(process.env.PORT || 3000);
// A loopback-only lock prevents duplicate background supervisors.
const lock = createServer();
lock.on('error', () => process.exit(0));
lock.listen(Number(process.env.SUPERVISOR_PORT || 3031), '127.0.0.1', async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      lock.close();
      return;
    }
  } catch {
    /* No existing server: start the owned instance. */
  }
  if (existsSync(stopFile)) unlinkSync(stopFile);
  launch();
});
let child,
  restart,
  stopping = false;
function logFile(name) {
  const filename = path.join(dataDir, name);
  if (existsSync(filename) && statSync(filename).size > 5 * 1024 * 1024) {
    const previous = `${filename}.1`;
    if (existsSync(previous)) unlinkSync(previous);
    renameSync(filename, previous);
  }
  return openSync(filename, 'a');
}
function launch() {
  if (stopping) return;
  const stdout = logFile('server.stdout.log'),
    stderr = logFile('server.stderr.log');
  child = spawn(
    process.execPath,
    ['--experimental-sqlite', path.join(root, 'server', 'index.js')],
    {
      cwd: root,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', stdout, stderr, 'ipc'],
    },
  );
  closeSync(stdout);
  closeSync(stderr);
  writeFileSync(
    stateFile,
    JSON.stringify(
      {
        supervisorPid: process.pid,
        serverPid: child.pid,
        root,
        port,
        started: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  child.once('error', finishChild);
  child.once('exit', finishChild);
}
function finishChild() {
  if (restart) return;
  if (stopping) {
    finish();
    return;
  }
  restart = setTimeout(() => {
    restart = null;
    launch();
  }, 10_000);
}
const stopPoll = setInterval(() => {
  if (existsSync(stopFile)) shutdown();
}, 1000);
stopPoll.unref();
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(restart);
  if (child?.connected) {
    child.send('shutdown');
    setTimeout(() => {
      child?.kill();
      finish();
    }, 20_000).unref();
  } else finish();
}
function finish() {
  if (existsSync(stateFile)) unlinkSync(stateFile);
  if (existsSync(stopFile)) unlinkSync(stopFile);
  clearInterval(stopPoll);
  lock.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
