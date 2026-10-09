import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesGroupName } from '../public/group-patterns.js';
import { selectedGroupIds, acceptsCaption, groupRule } from '../server/selected-groups.js';

test('group globs match whole names, ignore case and treat regex syntax literally', () => {
  assert.equal(matchesGroupName('Team Abc Holz', '*ABC*'), true);
  assert.equal(matchesGroupName('Workshop Community', '*workshop*'), true);
  assert.equal(matchesGroupName('Team 1', 'Team ?'), true);
  assert.equal(matchesGroupName('Team 12', 'Team ?'), false);
  assert.equal(matchesGroupName('Team 1', 'Team'), false);
  assert.equal(matchesGroupName('a.b', 'a.b'), true);
  assert.equal(matchesGroupName('axb', 'a.b'), false);
});

test('manual rules override first matching wildcard including captions; names update membership', () => {
  const settings = {
    groupIds: ['manual'],
    groupRules: { manual: { mode: 'hashtag', hashtag: '#custom', captionMode: 'none' } },
    knownGroups: [
      { id: 'manual', name: 'ABC one' },
      { id: 'auto', name: 'abc two' },
      { id: 'other', name: 'private' },
    ],
    groupPatterns: [
      { pattern: '*ABC*', mode: 'hashtag', hashtag: '#wall', captionMode: 'removeHashtag' },
      { pattern: '*', mode: 'hashtag', hashtag: '#fallback' },
    ],
  };
  assert.equal(acceptsCaption(settings, 'manual', '#wall'), false);
  assert.equal(acceptsCaption(settings, 'manual', '#CUSTOM'), true);
  assert.equal(groupRule(settings, 'manual').captionMode, 'none');
  assert.equal(acceptsCaption(settings, 'auto', '#WALL'), true);
  assert.equal(acceptsCaption(settings, 'auto', '#wallpaper'), false);
  assert.equal(acceptsCaption(settings, 'auto', '#fallback'), false);
  assert.equal(acceptsCaption(settings, 'unknown', '#wall'), false);
  settings.groupPatterns.pop();
  assert.deepEqual(selectedGroupIds(settings), ['manual', 'auto']);
  settings.knownGroups[1].name = 'Renamed';
  assert.deepEqual(selectedGroupIds(settings), ['manual']);
  settings.groupRules.manual = { mode: 'all' };
  assert.equal(acceptsCaption(settings, 'manual', ''), true);
});
