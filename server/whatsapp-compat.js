// Compatibility with WhatsApp Web's typed message keys (July 2026 onward).
// Keep the adapter in application source, not as an edit to node_modules.
export async function installMessageCompatibility(client) {
  await client.pupPage.evaluate(() => {
    const messages = window.require('WAWebCollections').Msg;
    if (messages.__wallRelayTypedKeys) return;
    const originalGet = messages.get;
    messages.get = function (key, ...args) {
      if (typeof key !== 'string' || !/^(true|false)_/.test(key))
        return originalGet.call(this, key, ...args);
      try {
        const result = originalGet.call(this, key, ...args);
        if (result) return result;
      } catch {
        /* New WhatsApp versions reject untyped string keys. */
      }
      const typed = window.require('WAWebMsgKey').fromString(key);
      return originalGet.call(this, typed, ...args);
    };
    const originalModel = window.WWebJS.getMessageModel;
    window.WWebJS.getMessageModel = function (message) {
      const result = originalModel(message);
      if (result?.id && !result.id._serialized) {
        const serialized = message.id?.toString();
        if (typeof serialized === 'string' && /^(true|false)_/.test(serialized))
          result.id._serialized = serialized;
      }
      return result;
    };
    messages.__wallRelayTypedKeys = true;
  });
}
