const { downloadMediaMessage, downloadContentFromMessage, generateWAMessageContent, generateWAMessageFromContent } = require("@whiskeysockets/baileys");

/**
 * Safely fetch media buffer with timeout and stream fallback
 */
async function fetchMediaBuffer(sock, msg, targetMsg, contextInfo, mediaType, mediaObj) {
    // 1. Try downloadMediaMessage with reconstructed Baileys message object
    try {
        const fakeMsg = (contextInfo && contextInfo.stanzaId) ? {
            key: {
                remoteJid: msg.key.remoteJid,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant || contextInfo.remoteJid || msg.key.remoteJid,
                fromMe: false
            },
            message: targetMsg
        } : msg;

        const downloadPromise = downloadMediaMessage(
            fakeMsg, 
            "buffer", 
            {}, 
            { logger: console, reuploadRequest: sock.updateMediaMessage }
        );
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Download timeout after 15s")), 15000)
        );

        const buf = await Promise.race([downloadPromise, timeoutPromise]);
        if (buf && buf.length > 0) return buf;
    } catch (err) {
        console.warn("⚠️ downloadMediaMessage failed, attempting stream fallback:", err.message);
    }

    // 2. Stream fallback via downloadContentFromMessage
    try {
        const stream = await downloadContentFromMessage(mediaObj, mediaType);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        if (buf && buf.length > 0) return buf;
    } catch (err) {
        console.error("⚠️ Stream fallback failed:", err.message);
    }

    return null;
}

/**
 * Deeply extracts the inner media object (image, video, audio) from any message container
 */
function extractMediaObject(msgContainer) {
    if (!msgContainer) return null;
    let m = msgContainer;

    // Unwrap ephemeral, viewOnce, documentWithCaption, etc.
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

    const imageMsg = m.imageMessage;
    const videoMsg = m.videoMessage;
    const audioMsg = m.audioMessage;

    if (imageMsg) return { type: "image", obj: imageMsg, rawContainer: m };
    if (videoMsg) return { type: "video", obj: videoMsg, rawContainer: m };
    if (audioMsg) return { type: "audio", obj: audioMsg, rawContainer: m };

    return null;
}

module.exports = {
    name: "toviewonce",
    aliases: ["tovvo", "toview1", "vv1"],
    description: "Convert a photo, video, or audio message into a view-once message",
    category: "general",
    execute: async (ctx) => {
        const { sock, jid, msg } = ctx;
        let statusMsg = null;

        try {
            // Find contextInfo from reply or direct message
            const rawMsg = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message;
            const contextInfo = rawMsg?.extendedTextMessage?.contextInfo || 
                                rawMsg?.imageMessage?.contextInfo || 
                                rawMsg?.videoMessage?.contextInfo || 
                                rawMsg?.audioMessage?.contextInfo ||
                                rawMsg?.documentMessage?.contextInfo;

            const quoted = contextInfo?.quotedMessage;
            const targetContainer = quoted || rawMsg;

            const mediaData = extractMediaObject(targetContainer);

            if (!mediaData) {
                return await sock.sendMessage(jid, { 
                    text: "⚠️ *Usage:* Reply to an image, video, or voice note with `.toviewonce` (or send media with `.toviewonce` as caption)." 
                }, { quoted: msg });
            }

            const { type: mediaType, obj: mediaObj, rawContainer } = mediaData;
            const isImage = mediaType === "image";
            const isVideo = mediaType === "video";
            const isAudio = mediaType === "audio";
            const caption = mediaObj.caption || "";

            statusMsg = await sock.sendMessage(jid, { text: "⏳ *Converting to View-Once...*" }, { quoted: msg });

            const buffer = await fetchMediaBuffer(sock, msg, rawContainer, contextInfo, mediaType, mediaObj);

            if (!buffer || buffer.length === 0) {
                if (statusMsg?.key) {
                    await sock.sendMessage(jid, { delete: statusMsg.key }).catch(() => {});
                }
                return await sock.sendMessage(jid, { 
                    text: "❌ *Download Failed:* Could not download media from WhatsApp servers within 15 seconds. The media file may be expired or unavailable." 
                }, { quoted: msg });
            }

            // Construct payload for viewOnceMessageV2
            let payload = {};
            if (isImage) {
                payload = { image: buffer, caption, mimetype: mediaObj.mimetype || "image/jpeg" };
            } else if (isVideo) {
                payload = { video: buffer, caption, mimetype: mediaObj.mimetype || "video/mp4" };
            } else if (isAudio) {
                payload = { audio: buffer, mimetype: mediaObj.mimetype || "audio/mp4", ptt: !!mediaObj.ptt };
            }

            let sendSuccess = false;

            // Attempt 1: Explicit viewOnceMessageV2 container via generateWAMessageContent + relayMessage
            try {
                const mediaContent = await generateWAMessageContent(payload, { upload: sock.waUploadToServer });
                const viewOnceObj = generateWAMessageFromContent(
                    jid,
                    {
                        viewOnceMessageV2: {
                            message: mediaContent
                        }
                    },
                    { quoted: msg }
                );

                await sock.relayMessage(jid, viewOnceObj.message, { messageId: viewOnceObj.key.id });
                sendSuccess = true;
                console.log("✅ Successfully relayed viewOnceMessageV2 to", jid);
            } catch (v2Err) {
                console.warn("⚠️ viewOnceMessageV2 relay failed, trying sendMessage fallback:", v2Err.message);
            }

            // Attempt 2: Standard sendMessage with viewOnce: true
            if (!sendSuccess) {
                try {
                    const sendPayload = { ...payload, viewOnce: true };
                    await sock.sendMessage(jid, sendPayload, { quoted: msg });
                    sendSuccess = true;
                    console.log("✅ Successfully sent viewOnce via sendMessage fallback to", jid);
                } catch (sendErr) {
                    console.error("❌ Both ViewOnce send attempts failed:", sendErr.message);
                    throw sendErr;
                }
            }

            // Delete progress status message ONLY after View-Once media is sent successfully
            if (sendSuccess && statusMsg?.key) {
                await sock.sendMessage(jid, { delete: statusMsg.key }).catch(() => {});
            }

        } catch (error) {
            console.error("❌ Toviewonce Error:", error);
            if (statusMsg?.key) {
                await sock.sendMessage(jid, { delete: statusMsg.key }).catch(() => {});
            }
            await sock.sendMessage(jid, { text: `❌ Failed to convert media to view-once: ${error.message || error}` }, { quoted: msg });
        }
    }
};
