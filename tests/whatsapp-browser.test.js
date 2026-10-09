import test from 'node:test';
import assert from 'node:assert/strict';
import { retireWhatsAppClient, profileBrowserEndpoint } from '../server/whatsapp-browser.js';

test('orphan recovery uses only the exact browser identifier from the private profile', () => {
  assert.equal(
    profileBrowserEndpoint('3456\n/devtools/browser/abcdef-1234\n'),
    'ws://127.0.0.1:3456/devtools/browser/abcdef-1234',
  );
  for (const value of [
    '0\n/devtools/browser/abc',
    '99999\n/devtools/browser/abc',
    '1234\nhttps://example.org',
    '1234\n/devtools/page/abc',
    '1234\n/devtools/browser/abc?token=secret',
  ])
    assert.equal(profileBrowserEndpoint(value), null);
});

test('disconnected browser is terminated even when the library skips browser.close', async () => {
  const process = { pid: 123, exitCode: null, signalCode: null };
  let destroyed = false,
    killed = null;
  await retireWhatsAppClient(
    {
      pupBrowser: { process: () => process },
      destroy: async () => {
        destroyed = true;
      },
    },
    {
      terminate: async (child) => {
        killed = child;
      },
    },
  );
  assert.equal(destroyed, true);
  assert.equal(killed, process);
});

test('hung browser retirement times out and kills only the owned process', async () => {
  const process = { pid: 456, exitCode: null, signalCode: null };
  let killed = null;
  await retireWhatsAppClient(
    { pupBrowser: { process: () => process }, destroy: () => new Promise(() => {}) },
    {
      timeoutMs: 5,
      terminate: async (child) => {
        killed = child;
      },
    },
  );
  assert.equal(killed, process);
});

test('normal exit and missing browser never invoke forced cleanup', async () => {
  const process = { pid: 789, exitCode: null, signalCode: null };
  const terminate = async () => assert.fail('must not terminate unrelated or exited processes');
  await retireWhatsAppClient(
    {
      pupBrowser: { process: () => process },
      destroy: async () => {
        process.exitCode = 0;
      },
    },
    { terminate },
  );
  await retireWhatsAppClient({ destroy: async () => {} }, { terminate });
});
