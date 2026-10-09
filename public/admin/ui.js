import { cloneTemplate, setText } from '../templates.js';
let toastTimer;
export const $ = (selector, root = document) => root.querySelector(selector);
export function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.className = error ? 'show error' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (element.className = ''), 5000);
}
export function guarded(action) {
  return async (event) => {
    try {
      await action(event);
    } catch (error) {
      toast(error.message, true);
    }
  };
}
export const statusLabels = {
  disconnected: 'Nicht verbunden',
  connecting: 'Verbindung wird aufgebaut',
  qr: 'QR-Code scannen',
  authenticated: 'Gruppen werden geladen',
  ready: 'Verbunden',
  error: 'Verbindung prüfen',
};
export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}
export function heading(kicker, title, description, actions) {
  const fragment = cloneTemplate('page-heading');
  setText(fragment, '[data-kicker]', kicker);
  setText(fragment, '[data-title]', title);
  setText(fragment, '[data-description]', description);
  if (actions) fragment.querySelector('.heading-actions').append(actions);
  return fragment;
}
