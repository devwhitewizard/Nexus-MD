const fs = require("fs");
const path = require("path");
const { initAuthState, generateSessionId } = require("../../connection/auth");
const { createWASocket } = require("../../connection/socket");

module.exports = {
    name: "pair",
    description: "Generate a Session ID for another number using pairing code.",
    category: "system",
    usage: "pair <number>",
    execute: async ({ sock, jid, args, msg }) => {
        if (!args[0]) return await sock.sendMessage(jid, { text: "❌ Please provide a phone number with country code.\nExample: `.pair 254797715445`" });

        const targetNumber = args[0].replace(/[^0-9]/g, "");
        if (targetNumber.length < 10) return await sock.sendMessage(jid, { text: "❌ Invalid phone number format." });

        const pairingId = `pair_${Date.now()}`;
        const tempSessionDir = path.join(__dirname, "../../tmp", pairingId);

        await sock.sendMessage(jid, { text: "⏳ *Generating Pairing Code...* Please wait." });

        const NodeCache = require("node-cache");
        const msgRetryCounterCache = new NodeCache();

        try {
            const { state, saveCreds } = await initAuthState(tempSessionDir);

            const pairSock = await createWASocket(state, {
                browser: ["Ubuntu", "Chrome", "20.0.04"],
                msgRetryCounterCache,
            });

            // 1. Request the code
            setTimeout(async () => {
                try {
                    const code = await pairSock.requestPairingCode(targetNumber);

                    const pairingMsg = `💎 *NEXUS-1MD PAIRING* 💎\n\n` +
                                     `━━━━━━━━━━━━━━━━━━━\n` +
                                     `1. Open WhatsApp Settings\n` +
                                     `2. Linked Devices > Link with Phone\n` +
                                     `3. Enter the code below 👇\n` +
                                     `━━━━━━━━━━━━━━━━━━━`;

                    await sock.sendMessage(jid, { text: pairingMsg }, { quoted: msg });

                    // Clean, dedicated message for 1-tap copy
                    await sock.sendMessage(jid, { text: code });

                } catch (e) {
                    console.error("Pairing Request Error:", e);
                }
            }, 6000);

            // 2. Monitor for connection
            pairSock.ev.on("creds.update", saveCreds);
            pairSock.ev.on("connection.update", async (update) => {
                const { connection } = update;

                if (connection === "open") {
                    // Small delay to let Baileys finalize cred writes (registered flag, keys, etc.)
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    const result = generateSessionId(tempSessionDir);
                    if (!result) {
                        console.error("Pairing Error: could not read temporary credentials.");
                        return;
                    }

                    const { sessionId } = result;

                    await sock.sendMessage(jid, {
                        text: `✅ *Session Generated!*\nCopy the code below:`
                    });

                    // Send ID as separate message for 1-tap copy
                    await sock.sendMessage(jid, { text: sessionId });

                    await sock.sendMessage(jid, {
                        text: `💎 *How to use:* \n1. Copy the code above.\n2. Paste it as \`SESSION_ID\` in your Render/Heroku environment variables.`
                    });

                    // Cleanup
                    pairSock.ev.removeAllListeners();
                    setTimeout(() => {
                        fs.rmSync(tempSessionDir, { recursive: true, force: true });
                    }, 5000);
                }
            });

            // 3. Auto-timeout after 5 minutes
            setTimeout(() => {
                try {
                    pairSock.end();
                    if (fs.existsSync(tempSessionDir)) {
                        fs.rmSync(tempSessionDir, { recursive: true, force: true });
                    }
                } catch (e) {}
            }, 300000);

        } catch (err) {
            console.error("Critical Pairing Error:", err);
            await sock.sendMessage(jid, { text: "❌ Internal error occurred during pairing setup." });
        }
    }
};
