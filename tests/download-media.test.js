import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { downloadImage } from '../server/download-media.js';

test('fallback downloads the original with MIME type using typed message lookup', async () => {
  const native = {
    type: 'image',
    mimetype: 'image/jpeg',
    directPath: '/image',
    mediaKey: 'test-key',
  };
  let downloads = 0;
  const context = {
    AbortSignal,
    window: {
      require: (name) =>
        ({
          WAWebCollections: {
            Msg: {
              get: (key) => {
                assert.equal(typeof key, 'object');
                return native;
              },
            },
          },
          WAWebMsgKey: { fromString: () => ({ typed: true }) },
          WAWebDownloadManager: {
            downloadManager: {
              downloadAndMaybeDecrypt: async (options) => {
                assert.equal(options.mimetype, 'image/jpeg');
                assert.equal(options.type, 'image');
                downloads++;
                return Buffer.from('original image');
              },
            },
          },
        })[name],
      WWebJS: { arrayBufferToBase64Async: async (data) => Buffer.from(data).toString('base64') },
    },
  };
  const message = {
    id: { _serialized: 'false_group@g.us_ABC' },
    downloadMedia: async () => {
      throw new Error('legacy API failed');
    },
    client: {
      pupPage: {
        evaluate: async (fn, id) =>
          vm.runInNewContext(`(${fn.toString()})(id)`, { ...context, id }),
      },
    },
  };
  assert.equal(
    (await downloadImage(message)).data,
    Buffer.from('original image').toString('base64'),
  );
  assert.equal(downloads, 1);
  native.isViewOnce = true;
  await assert.rejects(() => downloadImage(message), /Bildnachricht nicht verfügbar/);
  assert.equal(downloads, 1);
});
