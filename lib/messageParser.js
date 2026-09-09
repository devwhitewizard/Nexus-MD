/**
 * Unwraps nested message containers (ephemeral, viewOnce, document, edited, etc.)
 */
function unwrapMessageContent(msgContent) {
    if (!msgContent) return {};
    let m = msgContent;
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    if (m.protocolMessage?.editedMessage) {
        m = m.protocolMessage.editedMessage;
        if (m.extendedTextMessage) m = m.extendedTextMessage;
    }
    return m || {};
}

/**
 * Parses a raw Baileys message into a clean, flat context object.
 * @param {object} msg - Raw message from messages.upsert
 * @returns {{ jid, sender, text, isGroup, msg }}
 */
function parseMessage(msg) {
    if (!msg || !msg.key) return { jid: "", sender: "", text: "", isGroup: false, msg };

    const jid = msg.key.remoteJid || "";
    const isGroup = jid.endsWith("@g.us");

    // In groups the actual sender is key.participant; in DMs it's the jid itself
    const sender = (isGroup ? msg.key.participant : jid) || jid;

    const m = unwrapMessageContent(msg.message);

    const text =
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        m.buttonsResponseMessage?.selectedButtonId ||
        m.listResponseMessage?.singleSelectReply?.selectedRowId ||
        m.templateButtonReplyMessage?.selectedId ||
        (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? 
            (() => {
                try {
                    const p = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                    return p.id || p.rowId || "";
                } catch (e) { return ""; }
            })() : "") ||
        "";

    return { jid, sender, text, isGroup, msg };
}

module.exports = { parseMessage, unwrapMessageContent };

