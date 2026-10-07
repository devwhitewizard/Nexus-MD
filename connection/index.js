const path = require("path");
const { authFolder: rawAuthFolder, ownerNumbers } = require("../config");
const { initAuthState } = require("./auth");
const { resolveSessionId, clearSessionFlags } = require("./session");
const { createWASocket, requestPairingCode, renderQrCode } = require("./socket");
const { startWatchdog, stopWatchdog } = require("./watchdog");
const reconnect = require("./reconnect");

const authFolder = path.resolve(process.cwd(), rawAuthFolder || "session");

let isFirstConnect = true;
let isReconnecting = false;
let hasWipedSessionOnStartup = false;

/**
 * Initializes and manages WhatsApp connection lifecycle.
 */
async function startConnection() {
    if (isReconnecting) return;
    isReconnecting = true;


    // Startup session & temp media pruning
    const { cleanSessionFolder, cleanTempMedia } = require("../lib/sessionCleaner");
    cleanSessionFolder(24, true);
    try {
        const pruned = cleanTempMedia(6);
        if (pruned > 0) console.log(`🧹 [STARTUP] Cleaned ${pruned} stale temp media file(s).`);
    } catch (e) { }

    // Schedule 2-hour media pruning worker
    if (!global.pruneInterval) {
        global.pruneInterval = setInterval(() => {
            cleanSessionFolder();
            try { cleanTempMedia(6); } catch (e) { }
        }, 2 * 60 * 60 * 1000);
    }

    // 🔑 Resolve SESSION_ID from alternate config sources (delegated to session.js)
    resolveSessionId();

    // Initialize Auth State — session.js bootstrap runs inside initAuthState via auth.js
    const { state, saveCreds, syncSessionIdToEnv: syncEnv } = await initAuthState(authFolder);

    // Fresh login setup check — on first boot with no valid creds and no SESSION_ID,
    // wipe stale partial keys so a clean QR/pairing flow starts.
    // auth.js owns the actual wipe; index only decides WHEN it is appropriate.
    if (!hasWipedSessionOnStartup && !state.creds.registered && !process.env.SESSION_ID) {
        hasWipedSessionOnStartup = true;
        console.log("🧹 [STARTUP] Fresh login setup detected. Clearing stale keys via auth module...");
        const { wipeSessionFolder } = require("./auth");
        wipeSessionFolder(authFolder);
    }

    const authMode = (process.env.AUTH_MODE || process.env.MODE_AUTH || "").trim().toLowerCase();
    const explicitPairingNum = process.env.PAIRING_NUMBER ? process.env.PAIRING_NUMBER.trim() : "";
    const pairingNum = explicitPairingNum ? explicitPairingNum.replace(/[^0-9]/g, "") : "";
    const usePairingCode = !state.creds.registered && (authMode === "pairing" || (authMode !== "qr" && !!pairingNum));

    if (!state.creds.registered && !process.env.SESSION_ID) {
        if (usePairingCode && pairingNum) {
            console.log(`📲 Auth Mode: PAIRING CODE active (+${pairingNum})`);
        } else {
            console.log("📲 Auth Mode: QR CODE active. Scan terminal QR code or open web interface.");
        }
    }

    // Create WASocket
    const sock = await createWASocket(state);
    global.sock = sock;

    global.latestPairingCode = null;
    global.latestPairingNumber = pairingNum || null;

    const requestPairingCodeWrapper = async (phone) => {
        return await requestPairingCode(sock, phone || pairingNum);
    };
    global.requestPairingCode = requestPairingCodeWrapper;

    // ⌚ WATCHDOG: Fallback to pairing code if SESSION_ID connection hangs >60s
    let connectionTimeout = null;
    if (process.env.SESSION_ID) {
        connectionTimeout = setTimeout(async () => {
            if (!sock.user && !global.isSockConnected) {
                console.log("⚠️ [WATCHDOG] Session ID failed to connect within 60s. Falling back to Pairing Code...");
                process.env.SESSION_ID_FAILED = "true";
                if (pairingNum) {
                    await requestPairingCodeWrapper(pairingNum);
                }
            }
        }, 60000);
    }

    if (usePairingCode && !state.creds.registered && !process.env.SESSION_ID && pairingNum) {
        setTimeout(async () => {
            await requestPairingCodeWrapper(pairingNum);
        }, 5000);
    }

    // Credentials persistence listener
    sock.ev.on("creds.update", saveCreds);

    // Connection state updates listener
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            if ((!process.env.SESSION_ID || process.env.SESSION_ID_FAILED) && !state.creds.registered) {
                const activePairingNum = pairingNum || global.latestPairingNumber;
                if (usePairingCode && activePairingNum) {
                    await requestPairingCodeWrapper(activePairingNum);
                } else {
                    renderQrCode(qr, process.env.PORT || 3000);
                }
            }
        }

        if (connection === "open") {
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            clearSessionFlags();
            global.isSockConnected = true;
            global.latestQr = null;
            isReconnecting = false;
            global.botStartTime = Math.floor(Date.now() / 1000);
            console.log("✅ Bot connected and stable!");

            // Notify reconnect manager — resets retry counter, clears any pending timer
            reconnect.notifyConnected();

            // Auto-sync current active credentials to .env so SESSION_ID is always valid
            syncEnv();

            // Initialize Database & Settings
            const { initDb } = require("../nexus/db");
            await initDb();

            const { loadSettings, getSettings } = require("../lib/settings");
            await loadSettings();

            // Set up presence updates
            const settings = getSettings();
            if (settings.alwaysOnline) {
                await sock.sendPresenceUpdate("available").catch(() => { });
            }

            if (global.alwaysOnlineInterval) clearInterval(global.alwaysOnlineInterval);
            global.alwaysOnlineInterval = setInterval(async () => {
                try {
                    const currentSettings = getSettings();
                    if (currentSettings.alwaysOnline) {
                        await sock.sendPresenceUpdate("available").catch(() => { });
                    }
                } catch (e) { }
            }, 15000);

            // Resolve newsletter metadata for "View Channel" feature
            try {
                const metadata = await sock.newsletterMetadata("invite", "0029VbD62UY7IUYU6cftzu02").catch(() => null);
                if (metadata && metadata.id) {
                    global.newsletterJid = metadata.id;
                    global.newsletterName = metadata.subject || "Nexus-MD Updates";
                    console.log(`📢 Resolved Channel JID: ${global.newsletterJid} (${global.newsletterName})`);
                } else {
                    global.newsletterJid = "120363428521307680@newsletter";
                    global.newsletterName = "Nexus-MD Updates";
                }
            } catch (e) {
                global.newsletterJid = "120363428521307680@newsletter";
                global.newsletterName = "Nexus-MD Updates";
            }

            // Self ID setup
            const myJid = (sock.user && sock.user.id) || (sock.authState?.creds?.me?.id) || "";
            const { toJid } = require("../lib/utils");
            global.myJid = toJid(myJid);
            const primarySudo = process.env.SUDO ? toJid(process.env.SUDO) : toJid(ownerNumbers[0]);
            console.log(`📊 SELF-ID: ${global.myJid} | SUDO: ${primarySudo || "NOT CONFIGURED"}`);

            // Start connection healthcheck watchdog
            startWatchdog(sock, () => {
                try { sock.end(); } catch (e) { }
                process.exit(1);
            });

            // Send startup welcome message once on initial setup
            if (isFirstConnect) {
                isFirstConnect = false;
                const jsonStore = require("../nexus/jsonStore");
                if (!jsonStore.get("startup_welcome_sent")) {
                    jsonStore.set("startup_welcome_sent", true, true);
                    const { version } = require("../config");
                    const { sendButtonMessage } = require("../lib/utils");
                    const botName = settings.botName || "Nexus-MD";

                    const connectButtons = [
                        { text: "💻 GitHub Repo", url: "https://github.com/devwhitewizard/nexus-v1md" }
                    ];

                    const userWelcomeText = `✨ *${botName} v${version} Connected!* ✨\n\n` +
                        `🤖 *Status:* Connected.\n` +
                        `✅ *Secure:* Your connection is stable and encrypted.\n\n` +
                        `🌟 *Welcome!* Type *.menu* to see what I can do!`;

                    setTimeout(async () => {
                        try {
                            await sendButtonMessage(sock, global.myJid, userWelcomeText, botName, connectButtons, null, null);
                            console.log("✅ Startup welcome message sent successfully.");
                        } catch (e) { }
                    }, 5000);
                }
            }
        }

        if (connection === "close") {
            isReconnecting = false;
            stopWatchdog();
            if (global.alwaysOnlineInterval) clearInterval(global.alwaysOnlineInterval);

            global.isSockConnected = false;
            const { classifyDisconnect, CATEGORIES } = require("./disconnect");
            const classification = classifyDisconnect(lastDisconnect);
            console.log(`🔌 [DISCONNECT] ${classification.reasonText} (Category: ${classification.category})`);

            if (classification.category === CATEGORIES.AUTH_INVALID) {
                // AUTH_INVALID: stop any pending reconnect, wipe session, then
                // restart so QR/Pairing login is presented.
                // wipeSessionFolder is owned by auth.js — require locally to
                // avoid importing it at module top (keeps imports clean).
                console.log("⚠️ [AUTH] Account unlinked or session logged out. Requesting fresh QR/Pairing login...");
                process.env.SESSION_ID_INVALID = "true";

                // Halt the reconnect manager before wiping — prevents storm during wipe
                reconnect.stopReconnect();

                const jsonStore = require("../nexus/jsonStore");
                jsonStore.set("startup_welcome_sent", false);

                // Delegate the actual file deletion to auth.js
                const { wipeSessionFolder } = require("./auth");
                wipeSessionFolder(authFolder);

                // Resume manager with a clean slate so the fresh-login start is managed
                reconnect.resumeReconnect();
                reconnect.scheduleReconnect(classification.recommendedDelayMs);
            } else {
                // TEMPORARY / RECONNECT / RESTART_REQUIRED / UNKNOWN:
                // NEVER wipe session. Use managed backoff reconnect.
                reconnect.scheduleReconnect(classification.recommendedDelayMs);
            }
        }
    });

    // Messages listener
    const { handleMessages } = require("../lib/commandHandler");
    const { handleAutomation } = require("../lib/automation");
    const { logMessageCard } = require("../lib/logger");

    sock.ev.on("messages.upsert", async (upsert) => {
        if (upsert.type !== "notify") return;

        for (const m of upsert.messages) {
            if (!m.message) continue;

            let msgTime = 0;
            if (m.messageTimestamp) {
                let raw = m.messageTimestamp;
                if (typeof raw === "object" && raw !== null) {
                    raw = raw.toNumber ? raw.toNumber() : (raw.low || 0);
                }
                msgTime = Number(raw || 0);
                if (msgTime > 10000000000) msgTime = Math.floor(msgTime / 1000);
            }

            if (global.botStartTime && msgTime > 0 && msgTime < (global.botStartTime - 60)) {
                continue;
            }

            logMessageCard(m);
        }

        const m = upsert.messages[0];
        if (m && m.message) {
            handleAutomation(sock, m).catch(err => console.error("⚠️ Automation Error:", err));
            await handleMessages(sock, upsert);
        }
    });

    // Delete events listener
    const { handleMessageDelete } = require("../lib/automation");
    sock.ev.on("messages.update", async (update) => {
        await handleMessageDelete(sock, update);
    });

    // Anti-call protection listener
    sock.ev.on("call", async (calls) => {
        const { getSettings } = require("../lib/settings");
        const settings = getSettings();
        if (settings.antiCall) {
            for (const call of calls) {
                if (call.status === "offer") {
                    console.log(`📞 Anti-Call: Rejecting call from ${call.from}`);
                    await sock.rejectCall(call.id, call.from);
                }
            }
        }
    });

    // Group participants update listener (Welcome, Goodbye, Promote, Demote)
    sock.ev.on("group-participants.update", async (update) => {
        try {
            const { id, participants, action } = update;
            const metadata = await sock.groupMetadata(id).catch(() => null);

            const { getSettings } = require("../lib/settings");
            const settings = getSettings();
            const jsonStore = require("../nexus/jsonStore");
            const localMode = jsonStore.get(`events_mode_${id}`, null);
            const isActive = localMode !== null ? (localMode === "on") : settings.groupEventsGlobal;

            if (!isActive) return;
            if (!metadata) return;

            const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
            const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
            const groupName = metadata.subject || "";
            const groupDesc = metadata.desc?.toString()?.trim() || "Welcome to the official group community.";
            const memberCount = metadata.participants?.length || 0;
            const botBranding = (settings.botName || "NEXUS TECH").toUpperCase();

            const defaultWelcomeTemplate =
`╔═════════════════════════════════════╗
║ 🎉 WELCOME! 🎉                      ║
╚═════════════════════════════════════╝

👋 Hey @user! Welcome to *@group* 🏆

📋 _🚀 @group_

{desc}

👥 You are member *#{count}*
📅 Joined: *{date}* at *{time}*

✅ *Quick tips:*
 • Type *.menu* to see all commands
 • Be respectful to all members
 • Have fun! 🔥

__________________________________________________
🔊 *Reach us on:* WhatsApp group & channel

│ _${botBranding} ⚡_`;

            const defaultGoodbyeTemplate =
`╔═════════════════════════════════════╗
║ 👋 GOODBYE! 😢                      ║
╚═════════════════════════════════════╝

Goodbye @user from *@group*! We hope to see you back soon.

👥 Remaining members: *#{count}*
⌚ Left at: *{time}*

│ _${botBranding} ⚡_`;

            for (const participant of participants) {
                const userMention = `@${participant.split("@")[0]}`;

                if (action === "add") {
                    let msgTemplate = jsonStore.get(`welcome_msg_${id}`, null) || settings.welcomeMsg;
                    if (!msgTemplate || msgTemplate.includes("Hi @user, welcome to *@group*! 👋")) {
                        msgTemplate = defaultWelcomeTemplate;
                    }

                    const msg = msgTemplate
                        .replace(/@user/g, userMention)
                        .replace(/{user}/g, userMention)
                        .replace(/{group}/g, groupName)
                        .replace(/@group/g, groupName)
                        .replace(/{count}/g, memberCount)
                        .replace(/{date}/g, dateStr)
                        .replace(/{time}/g, timeStr)
                        .replace(/{desc}/g, groupDesc);

                    const ppUrl = await sock.profilePictureUrl(participant, "image").catch(() => sock.profilePictureUrl(id, "image").catch(() => null));
                    if (ppUrl) {
                        await sock.sendMessage(id, { image: { url: ppUrl }, caption: msg, mentions: [participant] }).catch(async () => {
                            await sock.sendMessage(id, { text: msg, mentions: [participant] }).catch(() => { });
                        });
                    } else {
                        await sock.sendMessage(id, { text: msg, mentions: [participant] }).catch(() => { });
                    }
                } else if (action === "remove") {
                    let msgTemplate = jsonStore.get(`goodbye_msg_${id}`, null) || settings.goodbyeMsg;
                    if (!msgTemplate || msgTemplate.includes("Goodbye @user, we hope to see you back soon! 😢")) {
                        msgTemplate = defaultGoodbyeTemplate;
                    }

                    const msg = msgTemplate
                        .replace(/@user/g, userMention)
                        .replace(/{user}/g, userMention)
                        .replace(/{group}/g, groupName)
                        .replace(/@group/g, groupName)
                        .replace(/{count}/g, memberCount)
                        .replace(/{date}/g, dateStr)
                        .replace(/{time}/g, timeStr)
                        .replace(/{desc}/g, groupDesc);

                    await sock.sendMessage(id, { text: msg, mentions: [participant] }).catch(() => { });
                } else if (action === "promote" && settings.eventsPromote) {
                    const msg = `🎉 *Promotion Notice:*\n\n${userMention} has been promoted to Admin in this group.\n\n⌚ *Time:* ${timeStr}`;
                    await sock.sendMessage(id, { text: msg, mentions: [participant] }).catch(() => { });
                } else if (action === "demote" && settings.eventsPromote) {
                    const msg = `⚠️ *Demotion Notice:*\n\n${userMention} is no longer an Admin in this group.\n\n⌚ *Time:* ${timeStr}`;
                    await sock.sendMessage(id, { text: msg, mentions: [participant] }).catch(() => { });
                }
            }
        } catch (err) {
            console.error("⚠️ Error handling group-participants.update:", err.message);
        }
    });
}

// Register the connection factory with the reconnect manager once at module load.
// This is the single lifecycle owner for all WhatsApp connection state.
reconnect.init(startConnection);

module.exports = {
    startConnection
};
