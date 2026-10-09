export function senderName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  if (!name || /@(?:c\.us|s\.whatsapp\.net|lid|g\.us)/i.test(name) || /^[+\d\s()./-]+$/.test(name))
    return '';
  return name.slice(0, 160);
}
