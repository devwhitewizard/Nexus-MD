const webtools = require("../../lib/webtools");

// Pure local parse — no network request is made.
module.exports = {
    name: "urlinfo",
    description: "Inspect the components of a URL.",
    category: "webtools",
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.urlinfo <url>`\n\n*Example:*\n▸ `.urlinfo https://example.com/path?a=1`" },
                { quoted: msg }
            );
        }

        let url;
        try {
            url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ Invalid URL.` }, { quoted: msg });
        }

        const protocol = url.protocol.replace(":", "").toUpperCase();
        const port = url.port || (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "none");
        const username = url.username || "none";
        const password = url.password ? "••• (present)" : "none";
        const hash = url.hash ? url.hash.slice(0, 80) : "none";

        const box =
            `🌐 *URL INFORMATION*\n\n` +
            `🔗 *URL:* ${raw.slice(0, 300)}\n` +
            `├ Protocol: ${protocol}\n` +
            `├ Hostname: ${url.hostname}\n` +
            `├ Port: ${port}\n` +
            `├ Path: ${(url.pathname || "/").slice(0, 200)}\n` +
            `├ Query: ${url.search ? url.search.slice(0, 150) : "none"}\n` +
            `├ Hash: ${hash}\n` +
            `├ Username: ${username}\n` +
            `└ Password: ${password}`;

        await sock.sendMessage(jid, { text: box }, { quoted: msg });
    }
};
