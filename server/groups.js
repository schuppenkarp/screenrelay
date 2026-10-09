// The full getChats() serializer also loads participants and last messages.
// For a group picker we only need the IDs and names already synced by WhatsApp.
export async function loadGroups(client) {
  const groups = await client.pupPage.evaluate(() => {
    const chats = window.require('WAWebCollections').Chat.getModelsArray();
    return chats.flatMap((chat) => {
      const id = chat.id?._serialized;
      if (typeof id !== 'string' || !id.endsWith('@g.us')) return [];
      return [
        {
          id,
          name:
            chat.formattedTitle || chat.name || chat.groupMetadata?.subject || 'Unbenannte Gruppe',
        },
      ];
    });
  });
  return [...new Map(groups.map((group) => [group.id, group])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'de'),
  );
}
