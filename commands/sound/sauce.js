const audioFx = require("../../lib/audioFx");
const songIdentifier = require("../../lib/songIdentifier");

// `.sauce` — identify a song. Uses the single shared identification service
// (songIdentifier.js) — no offline "magic" matching, no hardcoded keys.
module.exports = {
    name: "sauce",
    description: "Identify a song from a replied audio/video.",
    category: "sound",
    cooldown: 10000,
    async execute({ sock, jid, msg }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "sauce", null);
        if (!media) return;

        await sock.sendMessage(jid, { text: "🎵 Analyzing audio for identification..." }, { quoted: msg });

        const result = await songIdentifier.identify(media.buffer, media.mimetype);

        if (result.configured === false) {
            return await sock.sendMessage(
                jid,
                { text: "⚠️ Song identification is not configured yet.\n\nAn audio identification provider/API is required for `.sauce`." },
                { quoted: msg }
            );
        }
        if (result.tooLarge) {
            return await audioFx.sendTooLarge(sock, jid, msg);
        }
        if (result.unreachable) {
            return await sock.sendMessage(
                jid,
                { text: "⚠️ The identification service is unreachable right now. Please try again later." },
                { quoted: msg }
            );
        }
        if (!result.found) {
            return await sock.sendMessage(
                jid,
                { text: "❌ Couldn't identify that track. Try a clearer/longer audio clip." },
                { quoted: msg }
            );
        }

        const caption =
            `┌───[ 🎵 SONG IDENTIFIED ]\n` +
            `│ Title: ${result.title}\n` +
            `│ Artist: ${result.artist || "—"}\n` +
            (result.album ? `│ Album: ${result.album}\n` : "") +
            (result.year ? `│ Year: ${result.year}\n` : "") +
            `└────────────────────────` +
            (result.link ? `\n🔗 Link: ${result.link}` : "");

        await sock.sendMessage(jid, { text: caption }, { quoted: msg });
    }
};
