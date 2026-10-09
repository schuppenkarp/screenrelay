import { cloneTemplate, setText } from '../templates.js';
import { $ } from './ui.js';
import { json } from './api.js';
import { appearance, applyAppearance } from '../appearance.js';

export function createAuthPage({ api, boot }) {
  function authPage(session) {
    $('#app').replaceChildren(cloneTemplate('auth-page'));
    const form = $('#auth-form');
    $('[data-entra-login]', form).hidden = !session.entraEnabled || session.setup;
    if (new URLSearchParams(location.search).get('login') === 'entra-failed') {
      $('#auth-error').textContent =
        'Microsoft-Anmeldung fehlgeschlagen oder nicht freigegeben. Erneut versuchen oder den Masterzugang verwenden.';
      history.replaceState(null, '', location.pathname);
    }
    setText(form, '[data-auth-kicker]', session.setup ? 'WILLKOMMEN' : 'ADMINBEREICH');
    setText(
      form,
      '[data-auth-title]',
      session.setup ? 'Deine Bilderwand startet hier.' : 'Schön, dich zu sehen.',
    );
    setText(
      form,
      '[data-auth-description]',
      session.setup
        ? 'Lege ein Adminpasswort fest. Danach kannst du WhatsApp verbinden und deinen Monitor einrichten.'
        : 'Melde dich an, um eure Bilder und die Anzeige zu verwalten.',
    );
    setText(
      form,
      '[data-password-label]',
      session.setup ? 'Neues Adminpasswort' : 'Masterkennwort',
    );
    setText(form, '[data-submit-label]', session.setup ? 'Bilderwand einrichten' : 'Anmelden');
    if (!session.setup || !session.requiresSetupKey) $('[data-setup-key]', form).remove();
    if (!session.setup) $('[data-confirm]', form).remove();
    form.elements.password.autocomplete = session.setup ? 'new-password' : 'current-password';
    form.elements.password.placeholder = session.setup
      ? 'Mindestens 12 Zeichen'
      : 'Dein Adminpasswort';
    if (session.setup) form.elements.password.minLength = 12;
    applyAppearance(appearance);
    $('#auth-form').onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        values = Object.fromEntries(new FormData(form));
      $('#auth-error').textContent = '';
      if (session.setup && values.password !== values.confirm) {
        $('#auth-error').textContent = 'Die Passwörter stimmen nicht überein.';
        return;
      }
      $('button', form).disabled = true;
      try {
        await api(session.setup ? '/api/setup' : '/api/login', json('POST', values));
        await boot();
      } catch (error) {
        $('#auth-error').textContent = error.message;
        $('button', form).disabled = false;
      }
    };
  }

  return authPage;
}
