const webtools = require("../../lib/webtools");

module.exports = {
    name: "headers",
    description: "View the HTTP response headers of a URL.",
    category: "webtools",
    cooldown: 4000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.headers <url>`\n\n*Example:*\n▸ `.headers https://example.com`" },
                { quoted: msg }
            );
        }

        let result;
        try { await webtools.parseWebUrl(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

        try {
            await sock.sendMessage(jid, { text: "⏳ Fetching headers..." }, { quoted: msg });
            result = await webtools.fetchHeaders(raw);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg });
        }

        const h = result.headers;
        const pick = (name) => {
            const v = h[name];
            if (typeof v === "undefined") return "";
            const s = Array.isArray(v) ? v.join(", ") : String(v);
            return s.slice(0, 180);
        };

        const lines = [
            `🌐 *HTTP HEADERS*`,
            ``,
            `🔗 *URL:* ${result.finalUrl.slice(0, 200)}`,
            `📈 *Status:* ${result.status}`,
            `├ Server: ${pick("server") || "—"}`,
            `├ Content-Type: ${pick("content-type") || "—"}`,
            `├ Content-Length: ${pick("content-length") || "—"}`,
            `├ Cache-Control: ${pick("cache-control") || "—"}`,
            `├ Location: ${pick("location") || "—"}`,
            `├ Date: ${pick("date") || "—"}`,
            `├ Strict-Transport-Security: ${pick("strict-transport-security") || "—"}`,
            `└ Total headers: ${Object.keys(h).length}`
        ];

        await sock.sendMessage(jid, { text: lines.join("\n") }, { quoted: msg });
    }
};
