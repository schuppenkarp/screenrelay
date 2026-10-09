import { cloneTemplate, fillForm } from '../templates.js';
import { $, toast, guarded, heading } from './ui.js';
import { json } from './api.js';

export function createPlaybackPage({ api, getData, getPage, refresh, render }) {
  function settingsPage() {
    const s = getData().settings;
    $('#content').replaceChildren(
      heading(
        'EINSTELLUNGEN',
        getPage() === 'retention' ? 'Foto-Lebensdauer' : 'Wiedergabe',
        getPage() === 'retention'
          ? 'Lebensdauer, Mindestbestand und Anzeigelimit eurer Fotos.'
          : 'Anzeigedauer, Übergänge und Darstellung der Inhalte.',
      ),
      cloneTemplate('playback-settings'),
    );
    fillForm($('#settings-form'), { ...s, photosPerScreen: s.photosPerScreen === 1 ? 1 : 2 });
    const form = $('#settings-form');
    for (const section of form.querySelectorAll(':scope > section')) {
      const retention = Boolean(section.querySelector('[name="retentionDays"]'));
      if (retention !== (getPage() === 'retention')) section.remove();
    }
    $('#settings-form').onsubmit = guarded(async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      for (const key of [
        'photoDuration',
        'pinDuration',
        'pinInterval',
        'transitionDuration',
        'photosPerScreen',
        'retentionDays',
        'minimumPhotos',
        'maximumPhotos',
      ])
        if (key in values) values[key] = Number(values[key]);
      for (const key of ['showCaptions', 'moderation'])
        if (event.currentTarget.elements.namedItem(key)) values[key] = values[key] === 'on';
      await api('/api/settings', json('PUT', values));
      await refresh();
      render();
      toast('Einstellungen gespeichert.');
    });
  }

  return settingsPage;
}
