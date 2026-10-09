function address(value) {
  if (typeof value === 'string') return value;
  if (typeof value?._serialized === 'string') return value._serialized;
  if (value?.user && value?.server) return `${value.user}@${value.server}`;
  return null;
}

export function normalizeMessageId(message) {
  const id = message.id;
  if (typeof id?._serialized === 'string' && id._serialized) return id._serialized;
  if (typeof id === 'string' && id) {
    message.id = { _serialized: id };
    return id;
  }
  const remote = address(id?.remote) || address(message.fromMe ? message.to : message.from);
  if (!remote || typeof id?.id !== 'string' || !id.id)
    throw new Error('WhatsApp-Nachrichten-ID fehlt oder ist ungültig.');
  const participant = address(id.participant);
  const serialized = `${id.fromMe ?? message.fromMe ?? false}_${remote}_${id.id}${participant ? `_${participant}` : ''}`;
  message.id = { ...id, _serialized: serialized };
  return serialized;
}
