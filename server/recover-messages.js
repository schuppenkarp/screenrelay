export async function recentImageIds(client, groupId, since) {
  return client.pupPage.evaluate(
    async ({ groupId, since }) => {
      const chat = await window.WWebJS.getChat(groupId, { getAsModel: false });
      if (!chat) return [];
      let messages = chat.msgs?.getModelsArray() || [];
      for (let attempt = 0; attempt < 3 && messages.length < 100; attempt++) {
        const loaded = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
        if (!loaded?.length) break;
        messages = [...loaded, ...(chat.msgs?.getModelsArray() || [])];
      }
      const ids = messages
        .filter((m) => m.type === 'image' && !m.isViewOnce && m.t * 1000 >= since)
        .sort((a, b) => a.t - b.t)
        .slice(-100)
        .map((m) => {
          if (m.id._serialized) return m.id._serialized;
          const native = m.id.toString();
          if (/^(true|false)_/.test(native)) return native;
          const participant =
            typeof m.id.participant === 'string' ? m.id.participant : m.id.participant?._serialized;
          return `${m.id.fromMe}_${groupId}_${m.id.id}${participant ? '_' + participant : ''}`;
        });
      return [...new Set(ids)];
    },
    { groupId, since },
  );
}
