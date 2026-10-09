import { checkNoticeSizing } from './test-notice-browser.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { createApp } from '../server/app.js';

// Isolated fixtures only: never open the production database or paired accounts.
const directory = await mkdtemp(path.join(tmpdir(), 'wallrelay-admin-'));
const instance = createApp({
  dataDir: directory,
  entraRequest: async (url) =>
    url.includes('/token')
      ? Response.json({ access_token: 'browser-test-token', expires_in: 3600 })
      : Response.json({
          value: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              displayName: 'Browser User',
              mail: 'browser@example.test',
            },
            {
              id: '44444444-4444-4444-8444-444444444444',
              displayName: '<img src=x onerror=alert(1)>',
              mail: 'second@example.test',
            },
          ],
        }),
});
const server = instance.app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser, page;
const errors = [];
const artifactDirectory = process.env.BROWSER_TEST_ARTIFACT_DIR || 'test-results';
const changeFixtureSettings = (values) =>
  instance.store.set('settings', { ...instance.store.settings(), ...values });
try {
  browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: process.env.CHROMIUM_NO_SANDBOX === 'true' ? ['--no-sandbox'] : [],
  });
  page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.waitForSelector('#auth-form');
  await page.type('[name=password]', 'browser-test-password');
  await page.type('[name=confirm]', 'browser-test-password');
  await page.click('#auth-form button[type=submit]');
  await page.waitForSelector('#items-grid');
  await checkNoticeSizing(page);

  async function navigate(name, selector) {
    await page.click(`[data-page="${name}"]`);
    await page.waitForSelector(selector);
    assert.deepEqual(errors, [], `Browser errors on ${name}`);
  }
  for (const [name, selector] of [
    ['whatsapp', '#group-form'],
    ['settings', '#settings-form'],
    ['retention', '[name=retentionDays]'],
    ['layout', '.wall-settings'],
    ['touch', '.wall-settings'],
    ['organization', '#settings-page-content form'],
    ['calendar', '#settings-page-content form'],
    ['ai', '#settings-page-content'],
    ['drive', '#settings-page-content'],
    ['access', '#change-password'],
    ['display', '#monitor-access-form'],
    ['pins', '#new-text'],
  ])
    await navigate(name, selector);
  await navigate('whatsapp', '#group-form');
  await page.click('#add-group-pattern');
  await page.type('[data-pattern-name]', '*Workshop*');
  await page.click('[data-pattern-pin]');
  await page.click('#group-form button.primary');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-pattern-name]')?.value === '*Workshop*' &&
      document.querySelector('#toast')?.textContent.includes('gespeichert'),
  );
  assert.equal(instance.store.settings().groupPatterns[0].pattern, '*Workshop*');
  assert.equal(instance.store.settings().groupPatterns[0].allowPin, true);
  await page.click('[data-pattern-remove]');
  await page.click('#group-form button.primary');
  await page.waitForFunction(() => !document.querySelector('[data-pattern-row]'));
  await navigate('pins', '#new-text');
  for (const selector of ['#new-text', '#new-stream', '#new-reolink']) {
    await page.click(selector);
    await page.waitForSelector('#editor[open]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#editor:not([open])');
  }
  await page.click('#new-text');
  await page.waitForSelector('#editor[open]');
  await page.click('[data-table="insert"]');
  async function tableAction(action) {
    await page.$eval('#notice-source td', (cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.click(`[data-table="${action}"]`);
  }
  await tableAction('row-add');
  assert.equal(await page.$$eval('#notice-source tr', (rows) => rows.length), 2);
  await tableAction('column-add');
  assert.equal(await page.$eval('#notice-source tr', (row) => row.cells.length), 4);
  await tableAction('column-remove');
  assert.equal(await page.$eval('#notice-source tr', (row) => row.cells.length), 3);
  await tableAction('row-remove');
  assert.equal(await page.$$eval('#notice-source tr', (rows) => rows.length), 1);
  await tableAction('remove');
  assert.equal(await page.$$eval('#notice-source table', (tables) => tables.length), 0);
  await page.$eval('[contenteditable=true]', (element) => {
    element.textContent = 'Browser notice';
  });
  await page.click('#notice-source');
  await page.keyboard.press('End');
  await page.click('[data-command="insertHorizontalRule"]');
  assert.equal(await page.$$eval('#notice-source hr', (lines) => lines.length), 1);

  const noticeFrame = await (await page.$('.notice-monitor-preview iframe')).contentFrame();
  await noticeFrame.waitForFunction(() =>
    document.querySelector('.info-content')?.textContent.includes('Browser notice'),
  );
  await page.click('#editor [type=submit]');
  await page.waitForSelector('#editor:not([open])');
  assert.ok(instance.store.items().some((item) => item.body.includes('Browser notice')));

  // Group names are text, even if they contain HTML; saved rules survive DOM rendering.
  const groupName = '<img src=x onerror=alert(1)> Test group';
  changeFixtureSettings({
    groupIds: ['test@g.us'],
    groups: [{ id: 'test@g.us', name: groupName }],
    groupRules: {
      'test@g.us': { mode: 'hashtag', hashtag: '#wall', captionMode: 'removeHashtag' },
    },
  });
  await page.reload();
  await page.waitForSelector('#items-grid');
  await navigate('whatsapp', '[data-group-rule]');
  assert.equal(await page.$eval('[data-group-name]', (element) => element.textContent), groupName);
  assert.equal(await page.$$eval('[data-group-list] img', (elements) => elements.length), 0);
  assert.equal(
    await page.$eval('[data-caption-mode]', (element) => element.value),
    'removeHashtag',
  );
  await page.select('[data-caption-mode]', 'full');
  await page.click('#group-form .primary');
  await page.waitForFunction(() =>
    document.querySelector('#toast').textContent.includes('Gruppenauswahl gespeichert'),
  );
  assert.equal(instance.store.settings().groupRules['test@g.us'].captionMode, 'full');

  await navigate('settings', '#settings-form');
  await page.$eval('[name=photoDuration]', (element) => {
    element.value = '17';
  });
  await page.click('#settings-form [type=submit]');
  await page.waitForFunction(
    () => document.querySelector('#toast').textContent === 'Einstellungen gespeichert.',
  );
  assert.equal(instance.store.settings().photoDuration, 17);
  await navigate('library', '#files');
  const imagePath = path.join(directory, 'test-photo.png');
  await writeFile(
    imagePath,
    await sharp({ create: { width: 40, height: 60, channels: 3, background: '#246' } })
      .png()
      .toBuffer(),
  );
  await (await page.$('#files')).uploadFile(imagePath);
  await page.waitForSelector('[data-edit]');
  await page.click('[data-rotate=right]');
  await page.waitForFunction(() =>
    document.querySelector('.card-preview img')?.src.includes('?r=90'),
  );
  await page.click('[data-rotate=left]');
  await page.waitForFunction(
    () => !document.querySelector('.card-preview img')?.src.includes('?r='),
  );
  await page.click('[data-edit]');
  await page.waitForSelector('#item-form [type=submit]', { visible: true });
  await page.$eval('#item-form [name=title]', (element) => {
    element.value = 'Browser test photo';
  });
  await page.click('#item-form [type=submit]');
  await page.waitForSelector('#editor:not([open])');
  await page.waitForFunction(() =>
    document.querySelector('#items-grid').textContent.includes('Browser test photo'),
  );
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDirectory, 'admin-library.png'),
    fullPage: true,
  });
  await page.type('#search', 'no match here');
  assert.equal(await page.$$eval('[data-edit]', (elements) => elements.length), 0);
  await navigate('pins', '#items-grid');
  await navigate('library', '[data-pin]');
  await page.click('[data-pin]');
  await page.waitForFunction(() => !document.querySelector('[data-edit]'));
  await navigate('pins', '[data-edit]');

  // Exercise the extracted player services with real frames, images and a notice.
  const image = instance.store.items().find((item) => item.type === 'image');
  changeFixtureSettings({
    touchEnabled: true,
    touchDuration: 5,
    touchItemIds: [image.id],
    photoDuration: 2,
    pinDuration: 2,
    transitionDuration: 100,
  });
  const extraImages = [];
  for (let index = 0; index < 6; index++) {
    const buffer = await sharp({
      create: {
        width: index % 2 ? 60 : 40,
        height: index % 2 ? 40 : 60,
        channels: 3,
        background: index % 2 ? '#754' : '#457',
      },
    })
      .png()
      .toBuffer();
    extraImages.push(await instance.media.add(buffer, { title: 'Monitor fixture ' + index }));
  }
  const monitor = await browser.newPage();
  await monitor.evaluateOnNewDocument(() => {
    if (window === parent) window.transitionAudit = { active: null, count: 0, overlaps: [] };
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin) return;
      if (window !== parent && event.source === parent && event.data?.type === 'wall-advance') {
        parent.postMessage({ type: 'test-transition-start' }, location.origin);
      }
      if (window !== parent) return;
      const audit = window.transitionAudit;
      if (event.data?.type === 'test-transition-start') {
        if (audit.active) audit.overlaps.push('Two zones started before completion');
        audit.active = event.source;
        audit.count++;
      }
      if (event.data?.type === 'wall-done' && audit.active === event.source) audit.active = null;
    });
  });
  monitor.on('pageerror', (error) => errors.push(error.message));
  await monitor.setViewport({ width: 1920, height: 1080 });
  await monitor.goto(base + '/display');
  await monitor.waitForFunction(() =>
    [...document.querySelectorAll('.wall-zone')].some((frame) =>
      frame.contentDocument?.querySelector('.photo-tile img'),
    ),
  );
  assert.equal(await monitor.$eval('#info-panel', (element) => element.hidden), false);
  assert.ok(
    await monitor.$eval('#info-panel', (element) => element.textContent.includes('Browser notice')),
  );
  await monitor.screenshot({ path: path.join(artifactDirectory, 'monitor.png') });
  await monitor.waitForFunction(() => window.transitionAudit.count >= 6, { timeout: 20000 });
  assert.deepEqual(await monitor.evaluate(() => window.transitionAudit.overlaps), []);
  await monitor.mouse.click(10, 10);
  await monitor.waitForSelector('body.touch-active');
  await monitor.waitForFunction(() => !document.body.classList.contains('touch-active'), {
    timeout: 10000,
  });
  await monitor.close();
  for (const item of extraImages) await instance.media.remove(item.id);
  await page.bringToFront();
  await page.click('[data-delete]');
  await page.waitForFunction(() => !document.querySelector('[data-edit]'));
  assert.equal(instance.store.items().filter((item) => item.type === 'image').length, 0);
  await navigate('access', '[data-entra-form]:not([hidden])');
  await page.type('[name=tenantId]', '11111111-1111-4111-8111-111111111111');
  await page.type('[name=clientId]', '22222222-2222-4222-8222-222222222222');
  await page.type('[name=clientSecret]', 'browser-test-client-secret');
  // Enabling before the first user is chosen must still save a safe setup draft.
  await page.click('[data-entra-form] [name=enabled]');
  await page.click('[data-entra-form] [type=submit]');
  await page.waitForFunction(() =>
    document.querySelector('[data-secret-status]')?.textContent.startsWith('Geheimnis gespeichert'),
  );
  assert.equal(instance.store.get('entra').enabled, false);
  assert.equal(instance.store.get('entra').users.length, 0);
  await page.click('[data-entra-search-button]');
  await page.waitForSelector('[data-entra-results] button');
  assert.equal(await page.$$eval('[data-entra-results] img', (els) => els.length), 0);
  await page.click('[data-entra-results] button');
  assert.equal(await page.$eval('[data-entra-results] button', (el) => el.disabled), true);
  await page.click('[data-entra-results] .entra-user-row:nth-child(2) button');
  assert.equal(await page.$$eval('[data-entra-users] .entra-user-row', (els) => els.length), 2);
  await page.click('[data-entra-users] .entra-user-row:nth-child(2) button');
  await page.click('[data-entra-form] [name=enabled]');
  await page.click('[data-entra-form] [type=submit]');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-entra-status]')?.textContent ===
      'Microsoft-Anmeldung aktiviert.',
  );
  assert.equal(await page.$eval('[name=clientSecret]', (el) => el.value), '');
  assert.equal(instance.store.get('entra').enabled, true);
  assert.equal(instance.store.get('entra').users.length, 1);
  assert.equal(instance.store.get('entra').users[0].email, 'browser@example.test');
  await page.click('#logout');
  await page.waitForSelector('#auth-form');
  await page.waitForSelector('[data-entra-login]:not([hidden])');
  assert.deepEqual(errors, []);
  console.log(
    'Browser checks passed: admin pages, forms, photo lifecycle, rich text, safe group names, group rules, monitor frames, notice and touch return.',
  );
} catch (error) {
  console.error('Browser errors:', errors);
  if (page && !page.isClosed())
    console.error(
      await page.evaluate(() => ({
        page: location.pathname,
        error: document.querySelector('.form-error')?.textContent,
        toast: document.querySelector('#toast')?.textContent,
      })),
    );
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await instance.close();
  await rm(directory, { recursive: true, force: true });
}
