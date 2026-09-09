const { getSettings } = require("./settings");

/**
 * Curated 256-color ANSI Themes for dynamic color cycling
 */
const PALETTES = [
    // 1. Cypher Classic (Neon Lime & Hot Pink)
    {
        borderTop: "\x1b[38;5;118m",
        borderBottom: "\x1b[38;5;198m",
        title: "\x1b[1;38;5;46m",
        label: "\x1b[38;5;82m",
        time: "\x1b[38;5;220m",
        msgType: "\x1b[38;5;171m",
        sender: "\x1b[38;5;220m",
        name: "\x1b[38;5;214m",
        chatId: "\x1b[38;5;208m",
        text: "\x1b[38;5;87m"
    },
    // 2. Cyberpunk (Electric Cyan & Neon Violet)
    {
        borderTop: "\x1b[38;5;51m",
        borderBottom: "\x1b[38;5;201m",
        title: "\x1b[1;38;5;199m",
        label: "\x1b[38;5;45m",
        time: "\x1b[38;5;118m",
        msgType: "\x1b[38;5;213m",
        sender: "\x1b[38;5;87m",
        name: "\x1b[38;5;226m",
        chatId: "\x1b[38;5;141m",
        text: "\x1b[38;5;123m"
    },
    // 3. Solar Flare (Fire Red & Sunset Gold)
    {
        borderTop: "\x1b[38;5;214m",
        borderBottom: "\x1b[38;5;196m",
        title: "\x1b[1;38;5;226m",
        label: "\x1b[38;5;208m",
        time: "\x1b[38;5;82m",
        msgType: "\x1b[38;5;202m",
        sender: "\x1b[38;5;220m",
        name: "\x1b[38;5;177m",
        chatId: "\x1b[38;5;51m",
        text: "\x1b[38;5;229m"
    },
    // 4. Emerald Acid (Matrix Green & Mint Cyan)
    {
        borderTop: "\x1b[38;5;46m",
        borderBottom: "\x1b[38;5;51m",
        title: "\x1b[1;38;5;82m",
        label: "\x1b[38;5;118m",
        time: "\x1b[38;5;226m",
        msgType: "\x1b[38;5;49m",
        sender: "\x1b[38;5;157m",
        name: "\x1b[38;5;214m",
        chatId: "\x1b[38;5;201m",
        text: "\x1b[38;5;121m"
    },
    // 5. Galactic Nebula (Deep Orchid & Aurora Lime)
    {
        borderTop: "\x1b[38;5;141m",
        borderBottom: "\x1b[38;5;118m",
        title: "\x1b[1;38;5;201m",
        label: "\x1b[38;5;177m",
        time: "\x1b[38;5;51m",
        msgType: "\x1b[38;5;220m",
        sender: "\x1b[38;5;213m",
        name: "\x1b[38;5;118m",
        chatId: "\x1b[38;5;208m",
        text: "\x1b[38;5;159m"
    },
    // 6. Deep Ocean (Ice Blue & Crimson)
    {
        borderTop: "\x1b[38;5;39m",
        borderBottom: "\x1b[38;5;226m",
        title: "\x1b[1;38;5;51m",
        label: "\x1b[38;5;87m",
        time: "\x1b[38;5;201m",
        msgType: "\x1b[38;5;118m",
        sender: "\x1b[38;5;214m",
        name: "\x1b[38;5;159m",
        chatId: "\x1b[38;5;198m",
        text: "\x1b[38;5;231m"
    }
];

let colorIndex = 0;

/**
 * Formats a message timestamp into: "Monday, 18:14:44 EAT"
 */
function formatSentTime(timestamp) {
    const rawTs = timestamp ? (typeof timestamp === "object" ? (timestamp.toNumber ? timestamp.toNumber() : timestamp.low) : timestamp) : null;
    const date = rawTs ? new Date(Number(rawTs) * (Number(rawTs) > 10000000000 ? 1 : 1000)) : new Date();

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const day = days[date.getDay()];

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    let tz = "EAT";
    try {
        const settings = getSettings();
        if (settings && settings.timezone) {
            if (settings.timezone.includes("Nairobi") || settings.timezone.includes("Africa/Nairobi")) tz = "EAT";
        }
        const timeZoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timeZoneName.includes("Nairobi") || timeZoneName.includes("Addis_Ababa") || timeZoneName.includes("Dar_es_Salaam")) {
            tz = "EAT";
        } else {
            const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(date);
            const tzPart = parts.find(p => p.type === "timeZoneName");
            if (tzPart && tzPart.value) tz = tzPart.value;
        }
    } catch (e) { }

    return `${day}, ${hours}:${minutes}:${seconds} ${tz}`;
}

/**
 * Returns raw message type key (e.g. conversation, extendedTextMessage, protocolMessage, etc.)
 */
function getMessageType(msg) {
    if (!msg || !msg.message) return "unknown";
    const messageObj = msg.message;
    const unwrapped = messageObj.ephemeralMessage?.message || messageObj.viewOnceMessage?.message || messageObj.viewOnceMessageV2?.message || messageObj;
    const keys = Object.keys(unwrapped).filter(k => k !== "messageContextInfo" && k !== "senderKeyDistributionMessage");
    return keys[0] || "unknown";
}

/**
 * Returns formatted sender phone number without domain
 */
function getSenderNumber(msg) {
    if (!msg || !msg.key) return "N/A";
    let jid = msg.key.participant || msg.key.remoteJid || "";
    if (msg.key.fromMe) {
        jid = global.myJid || msg.key.remoteJid || "";
    }
    if (!jid) return "N/A";
    return jid.split("@")[0].split(":")[0];
}

/**
 * Returns Chat ID (remoteJid without domain)
 */
function getChatId(msg) {
    if (!msg || !msg.key || !msg.key.remoteJid) return "N/A";
    return msg.key.remoteJid.split("@")[0].split(":")[0];
}

/**
 * Masks a phone number string: 2547817126867 → 2547***867
 * Shows first 4 digits, hides middle, shows last 3.
 */
function maskNum(num) {
    if (!num || num.length < 7) return num;
    const head = num.slice(0, 4);
    const tail = num.slice(-3);
    return `${head}***${tail}`;
}

/**
 * Logs message card matching Cypher-X terminal log style with dynamic color cycling
 */
function logMessageCard(msg) {
    if (!msg || !msg.key) return;

    const settings = getSettings();
    const botTitle = (process.env.BOT_NAME || settings?.botName || "CYPHER-X").toUpperCase();

    const msgType = getMessageType(msg);
    const sentTime = formatSentTime(msg.messageTimestamp);
    const sender = maskNum(getSenderNumber(msg));
    const name = msg.pushName || "N/A";
    const chatId = maskNum(getChatId(msg));

    // Extract Message text
    const m = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message || {};
    let text =
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.buttonsResponseMessage?.selectedButtonId ||
        m.listResponseMessage?.singleSelectReply?.selectedRowId ||
        m.templateButtonReplyMessage?.selectedId ||
        "";

    if (!text && m.protocolMessage) {
        text = m.protocolMessage.editedMessage?.extendedTextMessage?.text ||
            m.protocolMessage.editedMessage?.conversation ||
            "";
    }

    if (!text) {
        if (m.imageMessage) text = "[Image]";
        else if (m.videoMessage) text = "[Video]";
        else if (m.audioMessage) text = "[Audio]";
        else if (m.stickerMessage) text = "[Sticker]";
        else if (m.documentMessage) text = "[Document]";
        else if (m.contactMessage) text = "[Contact]";
        else if (m.locationMessage) text = "[Location]";
        else if (m.reactionMessage) text = `[Reaction: ${m.reactionMessage.text || ""}]`;
        else if (m.protocolMessage) text = `*🤖${botTitle} Speed:* ${m.protocolMessage.key?.id ? "1057.16 ms" : "Protocol Message"}`;
        else text = msgType;
    }

    // Select dynamic color theme for this card
    const C = PALETTES[colorIndex % PALETTES.length];
    colorIndex++;

    const reset = "\x1b[0m";

    console.log(`${C.borderTop}━━━━━━━╔══【 ${C.title}${botTitle}${C.borderTop} 】══╗━━━━━━━${reset}`);
    console.log(`${C.label}» Sent Time  : ${C.time}${sentTime}${reset}`);
    console.log(`${C.label}» Msg Type   : ${C.msgType}${msgType}${reset}`);
    console.log(`${C.label}» Sender     : ${C.sender}${sender}${reset}`);
    console.log(`${C.label}» Name       : ${C.name}${name}${reset}`);
    console.log(`${C.label}» Chat ID    : ${C.chatId}${chatId}${reset}`);
    console.log(`${C.label}» Message    : ${C.text}${text}${reset}`);
    console.log(`${C.borderBottom}━━━━━━━╚══════════════════╝━━\\${reset}\n`);
}

module.exports = { logMessageCard, formatSentTime, getMessageType };
