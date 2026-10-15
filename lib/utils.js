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
    
    // No hardcoded username→number mappings. Usernames that are not
    // already JIDs fall through to digit extraction below (yields "" when
    // no digits are present), so outbound targets can only ever come from
    // the live paired account or the configured OWNERS list.
    
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
    const { getSettings } = require("./settings");
    const settings = getSettings();

    // Format clean message text with CTA links if provided
    let fullText = `${text}\n\n`;
    if (Array.isArray(buttons) && buttons.length > 0) {
        buttons.forEach(btn => {
            if (btn && btn.text && btn.url) {
                fullText += `🔗 *${btn.text}:* ${btn.url}\n`;
            }
        });
    }
    if (footerText) {
        fullText += `\n_${footerText}_`;
    }

    // Ensure quoted message has valid content before passing to Baileys
    const hasQuotedContent = quoted && quoted.key && quoted.message && Object.keys(quoted.message).length > 0;
    const sendOptions = hasQuotedContent ? { quoted } : {};

    try {
        if (media) {
            return await sock.sendMessage(jid, { image: media, caption: fullText.trim() }, sendOptions);
        } else {
            return await sock.sendMessage(jid, { text: fullText.trim() }, sendOptions);
        }
    } catch (err) {
        console.error("⚠️ sendButtonMessage error:", err.message);
        try {
            return await sock.sendMessage(jid, { text: fullText.trim() }, sendOptions);
        } catch (_) {}
    }
};

/**
 * Resolve outbound owner-notification targets.
 * Only the paired account (live self JID / PAIRING_NUMBER) and the
 * configured SUDO/OWNERS numbers. Deduplicated, no hardcoded fallbacks.
 * @returns {string[]} - Array of JIDs, possibly empty.
 */
const resolveOwnerTargets = () => {
    const targets = [];
    const seen = new Set();
    const add = (jid) => {
        if (jid && !seen.has(jid)) {
            seen.add(jid);
            targets.push(jid);
        }
    };
    try {
        if (global.myJid) add(toJid(global.myJid));
        if (process.env.PAIRING_NUMBER) add(toJid(process.env.PAIRING_NUMBER));
        const { ownerNumbers } = require("../config");
        for (const n of (ownerNumbers || [])) add(toJid(n));
    } catch (_) {}
    return targets;
};

module.exports = { toJid, sendButtonMessage, resolveOwnerTargets };
