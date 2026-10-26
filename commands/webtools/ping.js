const net = require("net");
const webtools = require("../../lib/webtools");

// Dual-purpose (single canonical .ping):
//  • `.ping`                → bot speed (previous behavior, unchanged)
//  • `.ping host | IP`      → TCP/443 reachability + latency (safe, no ICMP/shell)
module.exports = {
    name: "ping",
    aliases: ["p"],
    description: "Bot speed, or network latency of a host when given a host/IP.",
    category: "webtools",
    cooldown: 3000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();

        // ── Mode 1: host reachability
        if (raw && (net.isIP(raw) || /[\w-]+\.[\w.-]+/.test(raw))) {
            let host;
            try { host = webtools.parseHost(raw); }
            catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

            let lookups;
            try { lookups = await webtools.assertPublicHost(host); }
            catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

            // TCP ping to 443 (HTTPS) — no root/ICMP needed, no shell, injection-proof
            let probe;
            const started = Date.now();
            try { probe = await webtools.tcpProbe(lookups, 443); }
            catch (e) { return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg }); }
            void started;

            if (!probe.open) {
                return await sock.sendMessage(
                    jid,
                    {
                        text:
                            `🏓 *NETWORK PING*\n\n` +
                            `🖥 *Host:* ${host}\n` +
                            `❌ *Status:* Offline / Unreachable (TCP 443)\n` +
                            `⏱ *Time:* ${probe.ms}ms\n\n` +
                            `_Checked TCP port 443 (HTTPS) from the server._`
                    },
                    { quoted: msg }
                );
            }

            return await sock.sendMessage(
                jid,
                {
                    text:
                        `🏓 *NETWORK PING*\n\n` +
                        `🖥 *Host:* ${host}\n` +
                        `✅ *Status:* Online\n` +
                        `⏱ *Latency:* ${probe.ms}ms (TCP 443)\n\n` +
                        `_Checked TCP port 443 (HTTPS) from the server._`
                },
                { quoted: msg }
            );
        }

        // ── Mode 2: bot speed (unchanged original, no message edits)
        const start = Date.now();
        await sock.sendMessage(jid, { text: "⏱ Testing speed..." });
        const latency = Date.now() - start;
        await sock.sendMessage(jid, { text: `🏓 *Pong!*\n⏱ Latency: \`${latency}ms\`` }, { quoted: msg });
    }
};
