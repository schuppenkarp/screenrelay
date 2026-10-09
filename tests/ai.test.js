import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../server/store.js';
import { mediaService } from '../server/media.js';
import { aiService } from '../server/ai.js';

const categoryNames = [
  'sexual',
  'sexual/minors',
  'violence',
  'violence/graphic',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'illicit',
  'illicit/violent',
];
const moderation = (scores = {}, flagged = false) => ({
  results: [
    {
      flagged,
      categories: Object.fromEntries(categoryNames.map((key) => [key, false])),
      category_scores: { ...Object.fromEntries(categoryNames.map((key) => [key, 0])), ...scores },
    },
  ],
});
async function fixture(t, request) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wall-ai-'));
  const store = openStore(dir),
    ai = aiService(store, dir, request);
  t.after(async () => {
    await ai.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  await ai.configure({ key: 'test-openai', enabled: true });
  const buffer = await sharp({ create: { width: 10, height: 20, channels: 3, background: 'red' } })
    .jpeg()
    .toBuffer();
  const photo = await mediaService(store, dir).add(buffer, {
    title: 'Test',
    caption: 'Bildtext',
    visible: false,
  });
  return { dir, store, ai, photo };
}

test('free moderation checks image and caption, holds suspicious results, fails closed and respects approval', async (t) => {
  let result = moderation(),
    fail = false,
    calls = 0;
  const { store, ai, photo } = await fixture(t, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/moderations');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'omni-moderation-latest');
    assert.match(body.input[0].image_url.url, /^data:image\/jpeg;base64,/);
    assert.equal(body.input[1].text, 'Bildtext');
    if (fail) throw Error('Offline secret test-openai');
    return Response.json(result);
  });
  assert.equal(JSON.stringify(ai.state()).includes('test-openai'), false);
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, true);
  result = moderation({ violence: 0.25 });
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, false);
  assert.match(
    store.db.prepare('SELECT reason FROM image_reviews WHERE item_id=?').get(photo.id).reason,
    /Gewalt/,
  );
  result = moderation({}, true);
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, false);
  result = { results: [{ flagged: false }] };
  await ai.review(photo.id);
  assert.match(ai.state().error, /Unvollständige/);
  fail = true;
  await ai.review(photo.id);
  assert.match(ai.state().error, /Verbindung/);
  assert.equal(ai.state().error.includes('test-openai'), false);
  store.db.prepare("UPDATE image_reviews SET status='approved' WHERE item_id=?").run(photo.id);
  store.db.prepare('UPDATE items SET visible=1 WHERE id=?').run(photo.id);
  const before = calls;
  await ai.review(photo.id);
  assert.equal(calls, before);
  assert.equal(store.item(photo.id).visible, true);
});

test('Gemini orientation uses its own header key, holds rotations, skips flagged images and persists configuration', async (t) => {
  let result = moderation(),
    orientation = { rotation: 90, uncertain: false, reason: 'Drehen' },
    orientationCalls = 0;
  const { dir, store, ai, photo } = await fixture(t, async (url, options) => {
    if (url.includes('api.openai.com')) return Response.json(result);
    orientationCalls++;
    assert.match(
      url,
      /^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/test-model:generateContent$/,
    );
    assert.equal(url.includes('secret'), false);
    assert.equal(options.headers['x-goog-api-key'], 'gemini-secret');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(JSON.parse(options.body).contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(orientation) }] } }],
    });
  });
  await ai.configure({ provider: 'gemini', geminiKey: 'gemini-secret', geminiModel: 'test-model' });
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, true);
  assert.equal(store.item(photo.id).display_rotation, 90);
  assert.match(store.item(photo.id).url, /\?r=90$/);
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).display_rotation, 90); // Absolute recommendation, not cumulative.
  assert.match(
    store.db.prepare('SELECT reason FROM image_reviews WHERE item_id=?').get(photo.id).reason,
    /90°/,
  );
  await ai.configure({ cropEnabled: true });
  orientation = {
    rotation: 0,
    uncertain: false,
    reason: 'Aufrecht',
    cropSafe: true,
    cropFocus: [0.2, 0.2, 0.5, 0.5],
  };
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, true);
  assert.deepEqual(JSON.parse(store.item(photo.id).crop_focus), orientation.cropFocus);
  assert.equal(store.item(photo.id).display_rotation, 0);
  orientation.uncertain = true;
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, false);
  assert.equal(store.item(photo.id).crop_focus, null);
  result = moderation({ 'violence/graphic': 0.8 });
  const before = orientationCalls;
  await ai.review(photo.id);
  assert.equal(orientationCalls, before);
  const restarted = aiService(store, dir);
  await restarted.ready;
  assert.equal(restarted.state().geminiConfigured, true);
  assert.equal(restarted.state().provider, 'gemini');
  assert.equal(JSON.stringify(restarted.state()).includes('gemini-secret'), false);
  await restarted.close();
});

test('OpenRouter orientation uses separate credentials and malformed responses never release photos', async (t) => {
  let content = '{"rotation":0,"uncertain":false,"reason":"OK"}';
  const { ai, store, photo } = await fixture(t, async (url, options) => {
    if (url.includes('api.openai.com')) return Response.json(moderation());
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer router-secret');
    assert.equal(JSON.parse(options.body).model, 'provider/vision:free');
    return Response.json({ choices: [{ message: { content } }] });
  });
  await ai.configure({
    provider: 'openrouter',
    openrouterKey: 'router-secret',
    openrouterModel: 'provider/vision:free',
  });
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, true);
  content = '{"rotation":45,"uncertain":false,"reason":"bad"}';
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, false);
  content = 'not json';
  await ai.review(photo.id);
  assert.equal(store.item(photo.id).visible, false);
  const before = ai.state();
  await assert.rejects(ai.configure({ key: 'replacement', provider: 'unknown' }));
  assert.deepEqual(ai.state(), before);
  await assert.rejects(ai.configure({ threshold: 0 }));
  await assert.rejects(ai.configure({ enabled: 'false' }));
});

test('manual approval during a request is preserved', async (t) => {
  let finish;
  const { ai, store, photo } = await fixture(t, async () => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    return Response.json(moderation({}, true));
  });
  const task = ai.review(photo.id);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  store.db.prepare("UPDATE image_reviews SET status='approved' WHERE item_id=?").run(photo.id);
  store.db.prepare('UPDATE items SET visible=1 WHERE id=?').run(photo.id);
  finish();
  await task;
  assert.equal(store.item(photo.id).visible, true);
});
