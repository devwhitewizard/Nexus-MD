const axios = require("axios");
const webtools = require("../../lib/webtools");

// Re-homed from commands/general/shorten.js + shortlink.js merged into one:
// triggers .short / .shorten / .tinyurl / .cleanuri / etc. — one implementation.
module.exports = {
    name: "short",
    aliases: ["shorten", "shortlink", "tinyurl", "cleanuri", "rebrandly", "vurl", "ssur", "tinube"],
    description: "Shorten a long URL.",
    category: "webtools",
    cooldown: 4000,
    async execute({ sock, jid, args, text, msg }) {
        const url = (args[0] || "").trim();

        if (!url) {
            return await sock.sendMessage(jid, { text: "❓ *Usage:* `.short <url>`\n\n*Examples:*\n▸ `.short https://example.com/very/long/url`\n▸ `.tinyurl https://example.com`" }, { quoted: msg });
        }
        if (!/^https?:\/\//i.test(url) || url.length > 2048) {
            return await sock.sendMessage(jid, { text: "❌ Please provide a valid URL starting with `http://` or `https://`." }, { quoted: msg });
        }

        // Which provider to use is chosen by the exact alias that was typed.
        const trigger = text.split(/\s+/)[0].slice(1).toLowerCase();
        const providerByTrigger = {
            cleanuri: "cleanuri",
            tinyurl: "tinyurl",
            tinube: "tinyurl",
            ssur: "isgd",
            vurl: "isgd",
            rebrandly: "isgd"
        };
        const provider = providerByTrigger[trigger] || "isgd";

        try {
            await sock.sendMessage(jid, { text: "⏳ Shortening URL..." }, { quoted: msg });

            let shortUrl = "";
            if (provider === "cleanuri") {
                const res = await axios.post("https://cleanuri.com/api/v1/shorten", { url }, { timeout: 15000 });
                shortUrl = res.data?.result_url || "";
            } else if (provider === "tinyurl") {
                const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 15000, responseType: "text" });
                shortUrl = typeof res.data === "string" ? res.data.trim() : "";
                if (!/^https?:\/\//i.test(shortUrl)) shortUrl = "";
            } else {
                const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 15000, responseType: "text" });
                shortUrl = typeof res.data === "string" ? res.data.trim() : "";
                if (!/^https?:\/\//i.test(shortUrl)) shortUrl = "";
            }

            if (!shortUrl) throw webtools.offlineErr("The shortener service returned no link.");

            await sock.sendMessage(
                jid,
                { text: `🔗 *URL SHORTENED*\n\n▸ *Original:* ${url.slice(0, 300)}\n▸ *Shortened:* ${shortUrl}` },
                { quoted: msg }
            );
        } catch (error) {
            console.error("❌ URL Shortening Error:", error.message);
            // classic fallback: tinyurl
            try {
                const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 15000, responseType: "text" });
                const fallbackUrl = typeof res.data === "string" ? res.data.trim() : "";
                if (/^https?:\/\//i.test(fallbackUrl || "")) {
                    return await sock.sendMessage(
                        jid,
                        { text: `🔗 *URL SHORTENED (fallback service)*\n\n▸ *Original:* ${url.slice(0, 300)}\n▸ *Shortened:* ${fallbackUrl}` },
                        { quoted: msg }
                    );
                }
            } catch (fallbackErr) { /* silent */ }
            await sock.sendMessage(jid, { text: "❌ Shortening failed — the service may be down. Try again later." }, { quoted: msg });
        }
    }
};
