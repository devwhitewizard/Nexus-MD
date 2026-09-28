/**
 * Centralized utility functions for Nexus-1MD
 */

/**
 * Converts a raw number string to a standard WhatsApp JID
 * @param {string} number - The raw number (e.g., "25479...")
 * @returns {string} - The formatted JID (e.g., "25479...@s.whatsapp.net")
 */
const toJid = (number) => {
    if (!number) return "";
    
    // Clean input (e.g. remove '@' symbol from the start of usernames or tags if it's not a JID)
    let cleanedInput = String(number).trim();
    if (cleanedInput.startsWith("@") && !cleanedInput.endsWith("@s.whatsapp.net") && !cleanedInput.endsWith("@g.us")) {
        cleanedInput = cleanedInput.substring(1);
    }
    
    // Username mappings
    const usernameMap = {
        "whitewizard001": "254797715445@s.whatsapp.net"
    };
    
    if (usernameMap[cleanedInput.toLowerCase()]) {
        return usernameMap[cleanedInput.toLowerCase()];
    }
    
    if (cleanedInput.endsWith("@g.us")) return cleanedInput;
    if (cleanedInput.endsWith("@lid")) return cleanedInput;
    
    // Strip device suffix (e.g. :40) if present
    const userPart = cleanedInput.split("@")[0].split(":")[0];
    const digits = userPart.replace(/\D/g, "");
    if (!digits) return "";
    const cleanDigits = digits.replace(/^0/, "254");
    return `${cleanDigits}@s.whatsapp.net`;
};

/**
 * Sends a message with native flow clickable CTA buttons (URLs) and optional media header
 * @param {object} sock - Baileys socket
 * @param {string} jid - Target JID
 * @param {string} text - Message body
 * @param {string} footerText - Message footer
 * @param {Array} buttons - Array of { text: string, url: string }
 * @param {object} media - Optional image buffer or URL object (e.g. { url: "..." } or Buffer)
 * @param {object} quoted - Quoted message object
 */
const sendButtonMessage = async (sock, jid, text, footerText, buttons = [], media = null, quoted = null) => {
    // Check if device is set to iPhone (which only supports plain text/media without interactive buttons)
    const { getSettings } = require("./settings");
    const settings = getSettings();
    const isIphone = settings.device && settings.device.toLowerCase() === "iphone";

    // Format fallback text first
    let fallbackText = `${text}\n\n`;
    buttons.forEach(btn => {
        fallbackText += `🔗 *${btn.text}:* ${btn.url}\n`;
    });
    if (footerText) fallbackText += `\n_${footerText}_`;

    if (isIphone) {
        if (media) {
            return await sock.sendMessage(jid, { image: media, caption: fallbackText }, { quoted });
        }
        return await sock.sendMessage(jid, { text: fallbackText }, { quoted });
    }

    try {
        const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = require("@whiskeysockets/baileys");

        const nativeButtons = buttons.map(btn => ({
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
                display_text: btn.text,
                url: btn.url,
                merchant_url: btn.url
            })
        }));

        let header = undefined;
        if (media) {
            try {
                const isObj = media && typeof media === "object" && !Buffer.isBuffer(media);
                const hasUrl = isObj && media.url;
                if (Buffer.isBuffer(media) || typeof media === "string" || hasUrl) {
                    const prepared = await prepareWAMessageMedia(
                        { image: Buffer.isBuffer(media) ? media : (hasUrl ? { url: media.url } : { url: media }) },
                        { upload: sock.waUploadToServer }
                    );
                    header = proto.Message.InteractiveMessage.Header.create({
                        title: "",
                        hasMediaAttachment: true,
                        imageMessage: prepared.imageMessage
                    });
                }
            } catch (mediaErr) {
                console.warn("⚠️ Failed to prepare media header for button message, proceeding without image:", mediaErr.message);
            }
        }

        // Ensure quoted message has actual content
        const hasQuotedContent = quoted && quoted.key && quoted.message && Object.keys(quoted.message).length > 0;

        const interactiveMsg = proto.Message.InteractiveMessage.create({
            contextInfo: (!settings.hideViewChannel && global.newsletterJid) ? {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: global.newsletterJid,
                    newsletterName: global.newsletterName || "Nexus-MD Updates",
                    serverMessageId: 1
                }
            } : undefined,
            header,
            body: proto.Message.InteractiveMessage.Body.create({ text }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: footerText }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: nativeButtons
            })
        });

        const msgContent = {
            viewOnceMessage: {
                message: {
                    interactiveMessage: interactiveMsg
                }
            }
        };

        const waMsg = generateWAMessageFromContent(jid, msgContent, {
            userJid: (sock.user && sock.user.id) || global.myJid,
            quoted: hasQuotedContent ? quoted : undefined
        });

        return await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
    } catch (err) {
        const hasQuotedContent = quoted && quoted.key && quoted.message && Object.keys(quoted.message).length > 0;
        if (media) {
            return await sock.sendMessage(jid, { image: media, caption: fallbackText }, { quoted: hasQuotedContent ? quoted : undefined });
        }
        return await sock.sendMessage(jid, { text: fallbackText }, { quoted: hasQuotedContent ? quoted : undefined });
    }
};

module.exports = { toJid, sendButtonMessage };
