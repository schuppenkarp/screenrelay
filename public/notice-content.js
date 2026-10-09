import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
export const richPrefix = '<!--notice-rich-v1-->';
export function cleanNotice(html) {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'div',
      'span',
      'p',
      'br',
      'b',
      'i',
      'u',
      's',
      'strong',
      'em',
      'del',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'font',
    ],
    ALLOWED_ATTR: ['href', 'title', 'style', 'color', 'size', 'face'],
  });
  for (const el of fragment.querySelectorAll('*')) {
    const props = {};
    for (const key of [
      'color',
      'font-size',
      'font-family',
      'font-weight',
      'font-style',
      'text-decoration',
      'text-align',
    ]) {
      const value = el.style.getPropertyValue(key);
      if (value && !/url|var\(|expression/i.test(value)) props[key] = value;
    }
    if (props['font-family']) {
      const family = props['font-family'].split(',')[0].replace(/["']/g, '').trim();
      if (
        !['Nunito', 'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New'].includes(
          family,
        )
      )
        delete props['font-family'];
    }
    el.removeAttribute('style');
    for (const [key, value] of Object.entries(props)) el.style.setProperty(key, value);
    if (el.tagName === 'FONT') {
      const span = document.createElement('span');
      span.style.cssText = el.style.cssText;
      span.style.color = el.getAttribute('color') || '';
      const face = el.getAttribute('face');
      if (
        ['Nunito', 'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New'].includes(face)
      )
        span.style.fontFamily = face;
      const sizes = {
        1: '.7em',
        2: '.85em',
        3: '1em',
        4: '1.2em',
        5: '1.5em',
        6: '2em',
        7: '2.5em',
      };
      if (sizes[el.getAttribute('size')]) span.style.fontSize = sizes[el.getAttribute('size')];
      span.append(...el.childNodes);
      el.replaceWith(span);
    }
  }
  const wrapper = document.createElement('div');
  wrapper.append(fragment);
  return wrapper.innerHTML;
}
export function renderNoticeContent(body = '') {
  return cleanNotice(
    body.startsWith(richPrefix)
      ? body.slice(richPrefix.length)
      : marked.parse(body, { breaks: true }),
  );
}
