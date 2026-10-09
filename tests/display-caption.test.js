import test from 'node:test';
import assert from 'node:assert/strict';
import { displayCaption } from '../server/display-caption.js';
test('group caption setting overrides old hidden flags without changing stored text', () => {
  const item = {
    body: 'Unser Projekt #BILDERWAND #bilderwandExtra',
    title: 'Unser Projekt #BILDERWAND',
    hide_caption: 1,
    sender: 'Alex',
  };
  assert.equal(displayCaption(item, { captionMode: 'full' }).body, item.body);
  assert.equal(displayCaption(item, { captionMode: 'none' }).title, '');
  assert.equal(displayCaption(item, { captionMode: 'none' }).sender, 'Alex');
  const result = displayCaption(item, { captionMode: 'removeHashtag', hashtag: '#bilderwand' });
  assert.equal(result.body, 'Unser Projekt #bilderwandExtra');
  assert.equal(item.body, 'Unser Projekt #BILDERWAND #bilderwandExtra');
  assert.equal(
    displayCaption(
      { body: '#bilderwand', title: '#bilderwand' },
      { captionMode: 'removeHashtag', hashtag: '#bilderwand' },
    ).title,
    '',
  );
});
