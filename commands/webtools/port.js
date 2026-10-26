const webtools = require("../../lib/webtools");

module.exports = {
    name: "port",
    description: "Check whether a single TCP port is open on a host.",
    category: "webtools",
    cooldown: 3000,
    async execute({ sock, jid, msg, args }) {
        const hostRaw = (args[0] || "").trim();
        const portRaw = (args[1] || "").trim();

        if (!hostRaw || !portRaw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.port <host> <port>`\n\n*Example:*\n▸ `.port google.com 443`" },
                { quoted: msg }
            );
        }

        let host, port;
        try {
            host = webtools.parseHost(hostRaw);
            port = webtools.parsePort(portRaw);
        } catch (e) {
            return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg });
        }

        let lookups;
        try { lookups = await webtools.assertPublicHost(host); }
        catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

        // Single-user safety: single port only — never a scan.
        let probe;
        try { probe = await webtools.tcpProbe(lookups, port); }
        catch (e) { return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg }); }

        if (probe.open) {
            await sock.sendMessage(
                jid,
                {
                    text:
                        `🔌 *PORT CHECK*\n\n` +
                        `🖥 *Host:* ${host}\n` +
                        `🔢 *Port:* ${port}\n\n` +
                        `🟢 *Status:* OPEN\n` +
                        `⏱ *Response:* ${probe.ms}ms`
                },
                { quoted: msg }
            );
        } else {
            const reason = probe.refused ? "CLOSED (connection refused)" : probe.timedOut ? "UNREACHABLE (no response)" : "FILTERED";
            await sock.sendMessage(
                jid,
                {
                    text:
                        `🔌 *PORT CHECK*\n\n` +
                        `🖥 *Host:* ${host}\n` +
                        `🔢 *Port:* ${port}\n\n` +
                        `🔴 *Status:* ${reason}`
                },
                { quoted: msg }
            );
        }
    }
};
