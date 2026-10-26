const webtools = require("../../lib/webtools");

// Reuses the shared redirect-tracing service from `.redirect` — one
// implementation, chain resolver only.
module.exports = {
    name: "unshort",
    description: "Expand a shortened URL to its final destination.",
    category: "webtools",
    cooldown: 4000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.unshort <short_url>`\n\n*Example:*\n▸ `.unshort https://tinyurl.com/xyz`" },
                { quoted: msg }
            );
        }

        let result;
        try { await webtools.parseWebUrl(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

        try {
            await sock.sendMessage(jid, { text: "⏳ Resolving short URL..." }, { quoted: msg });
            result = await webtools.traceRedirects(raw);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg });
        }

        const text =
            `🔗 *URL EXPANDER*\n\n` +
            `📎 *Short URL:* ${raw.slice(0, 180)}\n` +
            `🎯 *Final URL:* ${result.finalUrl.slice(0, 300)}\n` +
            `🔀 *Redirects:* ${result.hops}`;

        await sock.sendMessage(jid, { text }, { quoted: msg });
    }
};
