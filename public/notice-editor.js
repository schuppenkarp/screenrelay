import { bindNoticeTables } from './notice-tables.js';
import { cloneTemplate } from './templates.js';
import { createNoticePreview } from './notice-preview-host.js';
import { cleanNotice, renderNoticeContent, richPrefix } from './notice-content.js';
export function editNotice(dialog, item, save) {
  dialog.classList.add('notice-editor');
  dialog.replaceChildren(cloneTemplate('notice-editor'));
  const input = dialog.querySelector('#notice-source');
  const preview = createNoticePreview(dialog.querySelector('.notice-monitor-preview'));
  input.innerHTML = renderNoticeContent(item?.body || '');
  dialog.querySelector('[name=visible]').checked = item?.visible ?? true;
  let range = null;
  const size = dialog.querySelector('#notice-size'),
    font = dialog.querySelector('#notice-font');
  const remember = () => {
    const s = window.getSelection();
    if (s.rangeCount && input.contains(s.anchorNode) && input.contains(s.focusNode)) {
      range = s.getRangeAt(0).cloneRange();
      const el = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
      const style = getComputedStyle(el);
      size.value = Math.round(parseFloat(style.fontSize));
      const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      font.value = [...font.options].some((o) => o.value === family) ? family : 'Nunito';
    }
  };
  document.addEventListener('selectionchange', remember);
  const update = () => {
    preview.update(richPrefix + cleanNotice(input.innerHTML));
  };
  function command(name, value, restoreSelection = true) {
    input.focus();
    if (range && restoreSelection) {
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(name, false, value);
    remember();
    update();
  }
  dialog.querySelectorAll('[data-command]').forEach((button) => {
    button.onmousedown = (e) => e.preventDefault();
    button.onclick = () => command(button.dataset.command);
  });
  bindNoticeTables(dialog, input, command);
  function setSize(value) {
    const pixels = Math.min(120, Math.max(8, Math.round(Number(value) || 18)));
    input.focus();
    if (range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    for (const el of input.querySelectorAll('font[size="7"]')) {
      el.removeAttribute('size');
      el.style.fontSize = pixels + 'px';
    }
    remember();
    size.value = pixels;
    update();
  }
  size.onchange = () => setSize(size.value);
  for (const [id, delta] of [
    ['notice-smaller', -1],
    ['notice-larger', 1],
  ]) {
    const button = dialog.querySelector('#' + id);
    button.onmousedown = (e) => e.preventDefault();
    button.onclick = () => setSize(Number(size.value) + delta);
  }
  font.onchange = () => command('fontName', font.value);
  dialog.querySelector('#notice-color').oninput = (e) => command('foreColor', e.target.value);
  input.oninput = update;
  input.onpaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html) command('insertHTML', cleanNotice(html));
    else command('insertText', e.clipboardData.getData('text/plain'));
  };
  dialog
    .querySelectorAll('[data-close]')
    .forEach((button) => (button.onclick = () => dialog.close()));
  dialog.addEventListener(
    'close',
    () => {
      preview.dispose();
      dialog.classList.remove('notice-editor');
      document.removeEventListener('selectionchange', remember);
    },
    { once: true },
  );
  dialog.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const button = dialog.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const body = richPrefix + cleanNotice(input.innerHTML);
      if (body.length > 20000) throw new Error('Inhalt zu umfangreich. Bitte kürzen.');
      await save({
        title: 'Infotafel',
        body,
        visible: dialog.querySelector('[name=visible]').checked,
        pinned: true,
        duration: null,
      });
      dialog.close();
    } catch (error) {
      dialog.querySelector('.form-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  update();
  dialog.showModal();
  input.focus();
}
