export async function downloadImage(message) {
  try {
    const result = await message.downloadMedia();
    if (result) return result;
  } catch (error) {
    if (!message.client?.pupPage) throw error;
  }
  if (!message.client?.pupPage) return undefined;
  // Bypass the UI download/resolution step; decrypt the original image using
  // WhatsApp's own download manager, with the already authenticated session.
  const result = await message.client.pupPage.evaluate(async (serialized) => {
    let stage = 'Nachricht suchen';
    try {
      const collection = window.require('WAWebCollections').Msg;
      const key = window.require('WAWebMsgKey').fromString(serialized);
      const msg =
        collection.get(key) || (await collection.getMessagesById([serialized]))?.messages?.[0];
      if (!msg || msg.isViewOnce || msg.type !== 'image')
        throw new Error('Bildnachricht nicht verfügbar');
      stage = 'Originaldatei herunterladen';
      const qpl = {
        addAnnotations() {
          return this;
        },
        addPoint() {
          return this;
        },
      };
      const buffer = await window
        .require('WAWebDownloadManager')
        .downloadManager.downloadAndMaybeDecrypt({
          directPath: msg.directPath,
          encFilehash: msg.encFilehash,
          filehash: msg.filehash,
          mediaKey: msg.mediaKey,
          mediaKeyTimestamp: msg.mediaKeyTimestamp,
          type: msg.type,
          mimetype: msg.mimetype,
          signal: AbortSignal.timeout(45_000),
          downloadQpl: qpl,
        });
      stage = 'Bilddaten konvertieren';
      return { data: await window.WWebJS.arrayBufferToBase64Async(buffer), mimetype: msg.mimetype };
    } catch (error) {
      return {
        error: `${stage}: ${error.message || String(error)}`,
        details: String(error.stack || '').slice(0, 1800),
      };
    }
  }, message.id._serialized);
  if (result.error) {
    console.warn('[WhatsApp] Download-Diagnose:', result.error, result.details);
    throw new Error(result.error);
  }
  return result;
}
