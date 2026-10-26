const webtools = require("../../lib/webtools");

module.exports = {
    name: "redirect",
    description: "Trace the redirect chain of a URL.",
    category: "webtools",
    cooldown: 4000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.redirect <url>`\n\n*Example:*\n▸ `.redirect http://github.com`" },
                { quoted: msg }
            );
        }

        let result;
        try { await webtools.parseWebUrl(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

        try {
            await sock.sendMessage(jid, { text: "⏳ Tracing redirects..." }, { quoted: msg });
            result = await webtools.traceRedirects(raw);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg });
        }

        const shown = result.chain.slice(0, 6);
        const lines = [
            `↪️ *REDIRECT CHECK*\n`,
            `🔗 *Original:* ${raw.slice(0, 180)}`,
            `🔁 *Chain:*`
        ];
        shown.forEach((hop, i) => {
            lines.push(`${i + 1}. [${hop.status}] ${hop.url.slice(0, 140)}${hop.location ? `\n   ↳ ${String(hop.location).slice(0, 140)}` : ""}`);
        });
        if (result.chain.length > shown.length) lines.push(`… (${result.chain.length - shown.length} more)`);

        lines.push(``);
        lines.push(`🎯 *Final URL:* ${result.finalUrl.slice(0, 200)}`);
        lines.push(`🔀 *Total Redirects:* ${result.hops}`);

        await sock.sendMessage(jid, { text: lines.join("\n") }, { quoted: msg });
    }
};
