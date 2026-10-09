import test from 'node:test';
import assert from 'node:assert/strict';
import { validVersion, newerVersion, releaseInfo } from '../server/releases.js';

test('updates accept only stable versions and compare numerically', async () => {
  assert.equal(validVersion('v1.1.0'), true);
  assert.equal(validVersion('v1.1.0-beta'), false);
  assert.equal(validVersion('../main'), false);
  assert.equal(newerVersion('v1.10.0', '1.9.5'), true);
  assert.equal(newerVersion('v1.1.0', '1.1.0'), false);
  const info = await releaseInfo('latest', async (url) => {
    assert.equal(url, 'https://api.github.com/repos/schuppenkarp/screenrelay/releases/latest');
    return Response.json({
      tag_name: 'v1.1.0',
      body: 'Notes',
      html_url: 'https://untrusted.example',
    });
  });
  assert.equal(info.url, 'https://github.com/schuppenkarp/screenrelay/releases/tag/v1.1.0');
  await assert.rejects(
    releaseInfo('latest', async () => Response.json({ tag_name: 'v2.0.0', prerelease: true })),
  );
});
