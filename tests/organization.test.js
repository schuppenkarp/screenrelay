import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import {
  neutralOrganization,
  validateOrganization,
  publicAppearance,
} from '../server/organization.js';
import { calendarService } from '../server/calendar.js';

test('organization validation protects local assets, calendar sources and display settings', () => {
  const settings = validateOrganization(
    {
      name: 'Workshop',
      accentColor: '#123456',
      calendarEnabled: true,
      calendarUrl: 'https://example.org/private.ics',
    },
    neutralOrganization,
  );
  assert.equal(settings.name, 'Workshop');
  assert.equal(publicAppearance(settings).calendarUrl, undefined);
  for (const invalid of [
    { logo: '/assets/../data/private.png' },
    { accentColor: 'red' },
    { calendarUrl: 'http://example.org/calendar' },
    { calendarUrl: 'https://user:password@example.org/calendar' },
    { timeZone: 'invalid' },
    { calendarRefreshSeconds: 1 },
    { calendarMaxEvents: 99 },
  ]) {
    assert.throws(() => validateOrganization(invalid, neutralOrganization));
  }
});

test('organization changes and image uploads are admin-only and survive restart without changing content', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'image-wall-brand-'));
  let instance = createApp({
    dataDir: dir,
    organizationPreset: 'neutral',
    calendarRequest: async () => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
  });
  let server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await instance.close();
    await rm(dir, { recursive: true, force: true });
  });
  assert.equal((await (await fetch(base + '/api/appearance')).json()).name, 'ScreenRelay');
  assert.equal(instance.store.get('organization').calendarEnabled, false);
  assert.equal(instance.store.get('organization').calendarUrl, '');
  assert.equal((await fetch(base + '/api/organization')).status, 401);
  assert.equal(
    (
      await fetch(base + '/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    401,
  );
  const setup = await fetch(base + '/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'a-long-test-password' }),
  });
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const content = await fetch(base + '/api/items/text', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Infotafel', body: 'Existing content' }),
  });
  assert.equal(content.status, 201);
  const changed = await fetch(base + '/api/organization', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      name: 'Our workshop',
      calendarEnabled: true,
      calendarUrl: 'https://example.org/private.ics',
    }),
  });
  assert.equal(changed.status, 200);
  const publicSettings = await (await fetch(base + '/api/appearance')).json();
  assert.equal(publicSettings.name, 'Our workshop');
  assert.equal(publicSettings.calendarUrl, undefined);
  const image = await sharp({
    create: { width: 32, height: 32, channels: 4, background: '#445566' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('image', new Blob([image], { type: 'image/png' }), 'logo.png');
  const upload = await fetch(base + '/api/organization/images/logo', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  });
  assert.equal(upload.status, 201);
  const logo = (await upload.json()).logo;
  assert.equal((await fetch(base + logo)).status, 200);
  assert.equal(instance.store.items().length, 1);
  await new Promise((resolve) => server.close(resolve));
  await instance.close();
  instance = createApp({
    dataDir: dir,
    organizationPreset: 'neutral',
    calendarRequest: async () => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
  });
  server = instance.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  assert.equal(instance.store.get('organization').name, 'Our workshop');
  assert.equal(instance.store.get('organization').logo, logo);
  assert.equal(instance.store.items()[0].body, 'Existing content');
});

test('calendar cache obeys its interval and clears results when disabled or source changes', async () => {
  let settings = {
    ...neutralOrganization,
    calendarEnabled: true,
    calendarUrl: 'https://example.org/a.ics',
  };
  let requests = 0;
  const calendar = calendarService(
    () => settings,
    async () => {
      requests++;
      return new Response(
        'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nDTSTART:20990101T120000Z\r\nSUMMARY:Next event\r\nEND:VEVENT\r\nEND:VCALENDAR',
      );
    },
  );
  // Construction schedules the first refresh; allow the mocked parser to finish.
  await new Promise((resolve) => setImmediate(resolve));
  await calendar.refresh();
  assert.equal(requests, 1);
  assert.equal(calendar.state().events.length, 1);
  settings = { ...settings, calendarEnabled: false };
  await calendar.refresh();
  assert.equal(calendar.state().events.length, 0);
  settings = { ...settings, calendarEnabled: true, calendarUrl: 'https://example.org/b.ics' };
  await calendar.refresh();
  assert.equal(requests, 2);
  assert.equal(calendar.state().events[0].title, 'Next event');
});

test('calendar manual check reports failure, retains cached events and recovers', async () => {
  let response = () =>
    new Response(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nDTSTART:20990101T120000Z\r\nSUMMARY:Preview\r\nEND:VEVENT\r\nEND:VCALENDAR',
    );
  const calendar = calendarService(
    () => ({
      ...neutralOrganization,
      calendarEnabled: true,
      calendarUrl: 'https://example.org/calendar.ics',
    }),
    async () => response(),
  );
  await calendar.refresh();
  const updated = calendar.state().updated;
  assert.ok(updated);
  response = () => new Response('Unavailable', { status: 503 });
  await calendar.refresh({ force: true });
  assert.equal(calendar.state().failed, true);
  assert.match(calendar.state().error, /503/);
  assert.equal(calendar.state().events[0].title, 'Preview');
  assert.equal(calendar.state().updated, updated);
  response = () => new Response('<html>Login</html>');
  await calendar.refresh({ force: true });
  assert.match(calendar.state().error, /keinen iCalendar/);
  response = () => new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR');
  await calendar.refresh({ force: true });
  assert.equal(calendar.state().failed, false);
  assert.equal(calendar.state().error, '');
  assert.deepEqual(calendar.state().events, []);
});
