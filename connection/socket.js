const {
    default: makeWASocket,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const P = require("pino");
const NodeCache = require("node-cache");
const qrcode = require("qrcode-terminal");
const { getSettings } = require("../lib/settings");
const { getMessage } = require("../nexus/messageModel");

/**
 * Creates and configures a single Baileys WASocket instance.
 * @param {object} authState - Baileys auth state object (state.creds & state.keys)
 * @param {object} config - Application/connection configuration overrides
 * @param {object} logger - Pino logger instance (defaults to silent logger)
 * @param {object} baileysOptions - Additional custom Baileys configuration options
 * @returns {Promise<object>} - Exactly one configured Baileys WASocket instance
 */
async function createWASocket(authState, config = {}, logger = null, baileysOptions = {}) {
    if (!authState || !authState.creds || !authState.keys) {
        throw new Error("Invalid authState passed to createWASocket factory.");
    }

    const socketLogger = logger || P({ level: "silent" });
    const msgRetryCounterCache = new NodeCache({ stdTTL: 300, maxKeys: 1000 });

    let version = [2, 3000, 1017531287]; // Fallback Baileys web version
    try {
        const { version: latestVer } = await fetchLatestBaileysVersion();
        version = latestVer;
        console.log(`ℹ️ [SOCKET] WhatsApp Web version: ${version.join(".")}`);
    } catch (e) {
        console.log("⚠️ [SOCKET] Failed to fetch latest WhatsApp version, using fallback.");
    }

    const socketConfig = {
        auth: {
            creds: authState.creds,
            keys: makeCacheableSignalKeyStore(authState.keys, socketLogger),
        },
        logger: socketLogger,
        version,
        markOnline: config.markOnline ?? true,
        browser: config.browser || Browsers.windows("Desktop"),
        msgRetryCounterCache,
        defaultQueryTimeoutMs: config.defaultQueryTimeoutMs || 30000,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        linkPreviewHighQuality: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: config.connectTimeoutMs || 60000,
        keepAliveIntervalMs: config.keepAliveIntervalMs || 15000, // 15s keepalive ping
        getMessage: async (key) => {
            try {
                const msg = await getMessage(key.id);
                return msg ? msg.content : undefined;
            } catch (e) {
                return undefined;
            }
        },
        ...baileysOptions
    };

    // Instantiate single socket instance
    const sock = makeWASocket(socketConfig);

    // Custom sendMessage wrapper to inject "View Channel" newsletter footer
    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options = {}) => {
        let msgPayload = typeof content === "string" ? { text: content } : content;
        const settings = getSettings();

        const isChannelHidden = settings.hideViewChannel === true || settings.hideViewChannel === "true" || settings.hideViewChannel === 1 || settings.hideViewChannel === "1";

        if (!isChannelHidden && global.newsletterJid) {
            const channelData = {
                newsletterJid: global.newsletterJid,
                newsletterName: global.newsletterName || "Nexus-MD Updates",
                serverMessageId: 100
            };

            if (msgPayload && typeof msgPayload === "object" && !msgPayload.delete && !msgPayload.react) {
                if (!msgPayload.contextInfo) msgPayload.contextInfo = {};
                msgPayload.contextInfo.forwardingScore = 999;
                msgPayload.contextInfo.isForwarded = true;
                msgPayload.contextInfo.forwardedNewsletterMessageInfo = channelData;

                if (options) {
                    if (!options.contextInfo) options.contextInfo = {};
                    options.contextInfo.forwardingScore = 999;
                    options.contextInfo.isForwarded = true;
                    options.contextInfo.forwardedNewsletterMessageInfo = channelData;
                }
            }
        }
        return await originalSendMessage(jid, msgPayload, options);
    };

    return sock;
}

/**
 * Requests and prints a WhatsApp pairing code for a target phone number.
 * @param {object} sock - Baileys WASocket instance
 * @param {string} phoneInput - Target phone number with country code
 */
async function requestPairingCode(sock, phoneInput) {
    if (!phoneInput) return null;
    let cleanPhone = String(phoneInput).replace(/[^0-9]/g, "");
    if (cleanPhone.length > 15) cleanPhone = cleanPhone.slice(0, 15);
    if (cleanPhone.length < 7) {
        console.error("❌ [PAIRING] Invalid phone number format:", phoneInput);
        return null;
    }

    try {
        console.log(`📡 [PAIRING] Requesting pairing code for +${cleanPhone}...`);
        if (!sock || typeof sock.requestPairingCode !== "function") {
            throw new Error("WhatsApp socket connection not ready yet.");
        }
        const code = await sock.requestPairingCode(cleanPhone);
        global.latestPairingCode = code;
        global.latestPairingNumber = cleanPhone;

        console.clear();
        console.log("\n========================================");
        console.log("🔗 YOUR NEXUS-MD PAIRING CODE:");
        console.log(`👉 ${code} 👈`);
        console.log("========================================");
        console.log("1. Open WhatsApp on your phone.");
        console.log("2. Go to Linked Devices > Link with Phone Number.");
        console.log(`3. Enter the code shown above.\n`);
        return code;
    } catch (err) {
        console.error("❌ [PAIRING] Failed to generate pairing code:", err.message || err);
        return null;
    }
}

/**
 * Displays terminal QR code or web instructions.
 * @param {string} qr - Baileys QR string
 * @param {number} port - Express server port
 */
function renderQrCode(qr, port = 3000) {
    global.latestQr = qr;
    const appUrl = process.env.HEROKU_APP_NAME
        ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com/qr`
        : (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}/qr` : `http://localhost:${port}/qr`);

    console.clear();
    console.log("💡 Need Pairing Code or Web Login?");
    console.log(`👉 Open ${appUrl} in your web browser for high-res QR code or Pairing Code login!\n`);
    console.log("📲 Scan this QR to login:\n");
    qrcode.generate(qr, { small: true });
    console.log("\n💡 Open web browser at:", appUrl);
}

module.exports = {
    createWASocket,
    requestPairingCode,
    renderQrCode
};
