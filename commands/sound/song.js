const mediaApi = require("../../lib/mediaApi");

// Search-only. `.song` deliberately does NOT auto-download — `.play` (existing
// download command) keeps that job; this just lists useful results.
module.exports = {
    name: "song",
    description: "Search for a song and list the top results.",
    category: "sound",
    cooldown: 5000,
    async execute({ sock, jid, args, msg }) {
        const query = args.join(" ").trim();
        if (!query) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.song <name>`\n\n*Example:*\n▸ `.song Calm Down`" },
                { quoted: msg }
            );
        }

        await sock.sendPresenceUpdate("composing", jid);
        await sock.sendMessage(jid, { text: `🎵 *Searching for:* ${query}...` }, { quoted: msg });

        try {
            const results = await mediaApi.ytSearch(query);
            if (!Array.isArray(results) || results.length === 0) {
                return await sock.sendMessage(
                    jid,
                    { text: `❌ No results found for: *${query}*. Try a different name.` },
                    { quoted: msg }
                );
            }

            const top = results.slice(0, 5);
            const lines = top.map((v, i) => {
                const title = String(v.title || "Unknown").slice(0, 70);
                const channel = String((v.author && v.author.name) || v.channel || "Unknown").slice(0, 45);
                const duration = v.duration || v.timestamp || "--:--";
                return `${i + 1}. *${title}*\n   👤 ${channel}  ⏱ ${duration}`;
            });

            const caption =
                `┌───[ 🎵 SONG SEARCH ]\n` +
                `│ Query: ${query.slice(0, 60)}\n` +
                `└────────────────────────\n\n` +
                `${lines.join("\n")}\n\n` +
                `_To download, use:_ *.play ${query.slice(0, 60)}*`;

            // Thumbnail of the top result as a nice preview (text body kept small)
            const first = top[0];
            if (first && first.thumbnail) {
                await sock.sendMessage(jid, { image: { url: first.thumbnail }, caption }, { quoted: msg });
            } else {
                await sock.sendMessage(jid, { text: caption }, { quoted: msg });
            }
        } catch (error) {
            console.error("[song] search failed:", (error && error.message) || error);
            await sock.sendMessage(
                jid,
                { text: "❌ Song search failed. Please try again later." },
                { quoted: msg }
            );
        }
    }
};
