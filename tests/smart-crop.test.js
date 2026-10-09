import test from 'node:test';
import assert from 'node:assert/strict';
import { smartCropPosition, validCropFocus } from '../public/smart-crop.js';
import { checkOrientation } from '../server/ai-providers.js';

test('smart crop protects subjects and limits removed image area for landscape and portrait slots', () => {
  const focus = [0.2, 0.2, 0.5, 0.5];
  assert.ok(smartCropPosition(focus, 1600, 1000, 1600, 900));
  assert.ok(smartCropPosition(focus, 1000, 1600, 800, 1600));
  assert.equal(smartCropPosition(focus, 1000, 1600, 1600, 900), null);
  assert.equal(smartCropPosition([0, 0, 1, 1], 1600, 1000, 1600, 900), null);
  assert.equal(smartCropPosition(focus, 1600, 1000, 0, 900), null);
  for (const width of [800, 900, 1200, 1600, 1800]) {
    for (const boxHeight of [800, 900, 1000, 1200]) {
      const position = smartCropPosition(focus, 1600, 1000, width, boxHeight);
      if (!position) continue;
      const w = Math.min(1, width / boxHeight / 1.6),
        h = Math.min(1, 1.6 / (width / boxHeight));
      const x = (position.x / 100) * (1 - w),
        y = (position.y / 100) * (1 - h);
      assert.ok(w * h >= 0.8);
      assert.ok(x <= focus[0] - 0.03 + 1e-9 && y <= focus[1] - 0.03 + 1e-9);
      assert.ok(x + w >= focus[0] + focus[2] + 0.03 - 1e-9);
      assert.ok(y + h >= focus[1] + focus[3] + 0.03 - 1e-9);
    }
  }
});

test('unsafe, missing or malformed AI crop suggestions fall back to the full photo', async () => {
  for (const focus of [null, [], [0, 0, 1.2, 1], [-0.1, 0, 1, 1], [0, 0, NaN, 1], [0, 0, 0, 1]])
    assert.equal(validCropFocus(focus), false);
  let verdict = {
    rotation: 0,
    uncertain: false,
    reason: 'OK',
    cropSafe: true,
    cropFocus: [0.2, 0.2, 0.5, 0.5],
  };
  const request = async () =>
    Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] });
  const config = { provider: 'gemini', geminiModel: 'test', cropEnabled: true };
  const check = () => checkOrientation(request, config, 'test', Buffer.from('test'));
  assert.deepEqual((await check()).cropFocus, verdict.cropFocus);
  config.cropEnabled = false;
  assert.equal((await check()).cropFocus, null);
  config.cropEnabled = true;
  verdict.cropSafe = false;
  assert.equal((await check()).cropFocus, null);
  verdict.cropSafe = true;
  verdict.rotation = 90;
  assert.equal((await check()).cropFocus, null);
  verdict.rotation = 0;
  verdict.cropFocus = [0, 0, 2, 1];
  assert.equal((await check()).cropFocus, null);
  delete verdict.cropFocus;
  assert.equal((await check()).cropFocus, null);
  assert.equal((await check()).hold, false);
});
