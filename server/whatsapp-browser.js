import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);

export function profileBrowserEndpoint(contents) {
  const [port, endpoint] = contents.trim().split(/\r?\n/);
  if (
    !/^\d+$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65535 ||
    !/^\/devtools\/browser\/[a-f0-9-]+$/i.test(endpoint)
  )
    return null;
  return `ws://127.0.0.1:${Number(port)}${endpoint}`;
}

// A Chrome relaunch can outlive Puppeteer's original process handle. Its
// private profile file identifies the exact browser, including a unique ID.
// Closing via that endpoint preserves cookies and avoids killing other Chrome.
export async function retireProfileBrowser(profileDir) {
  let endpoint;
  try {
    endpoint = profileBrowserEndpoint(
      await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8'),
    );
  } catch {
    return false;
  }
  if (!endpoint) return false;
  return new Promise((resolve) => {
    const socket = new WebSocket(endpoint);
    let watchdog;
    const finish = (result) => {
      clearTimeout(watchdog);
      socket.close();
      resolve(result);
    };
    socket.addEventListener(
      'open',
      () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })),
      { once: true },
    );
    socket.addEventListener('close', () => finish(true), { once: true });
    socket.addEventListener('error', () => finish(false), { once: true });
    watchdog = setTimeout(() => finish(false), 5000);
  });
}

// whatsapp-web.js skips browser.close() after a DevTools disconnect. Chromium
// may still run and lock LocalAuth's profile, so retire its owned process too.
export async function retireWhatsAppClient(
  client,
  { timeoutMs = 8000, terminate = terminateBrowser } = {},
) {
  if (!client) return;
  const process = client.pupBrowser?.process?.();
  let watchdog;
  try {
    await Promise.race([
      Promise.resolve()
        .then(() => client.destroy())
        .catch(() => {}),
      new Promise((resolve) => {
        watchdog = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
    if (process?.pid && process.exitCode === null && !process.signalCode) {
      await terminate(process);
    }
  }
}

async function terminateBrowser(process) {
  if (globalThis.process.platform === 'win32') {
    // The PID comes only from the browser spawned by this client; never kill
    // arbitrary Chrome processes or delete the paired WhatsApp profile.
    await execute('taskkill.exe', ['/PID', String(process.pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 10000,
    }).catch(() => {});
  } else {
    try {
      process.kill('SIGKILL');
    } catch {
      /* Already stopped. */
    }
  }
}
