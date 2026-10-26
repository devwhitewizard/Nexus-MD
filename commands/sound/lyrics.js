const mediaApi = require("../../lib/mediaApi");
const { clipText, safeText } = require("../../lib/devSafety");
module.exports = {
    name: "lyrics",
    aliases: ["lyric", "songlyrics"],
    description: "Get the lyrics for a song.",
    category: "sound",
    cooldown: 5000,
    execute: async ({ sock, jid, args, msg }) => {
        const query = args.join(" ");
        if (!query) {
            return await sock.sendMessage(jid, {
                text: "❓ *Usage:* `.lyrics <song name>`\n\n*Examples:*\n• `.lyrics Blinding Lights`\n• `.lyrics Perfect Ed Sheeran`"
            });
        }

        try {
            await sock.sendPresenceUpdate('composing', jid);
            await sock.sendMessage(jid, { text: `🔍 Searching for lyrics: *${query}*...` });


            const lyricsData = await mediaApi.getLyrics(query);

            if (!lyricsData || !lyricsData.lyrics) {
                return await sock.sendMessage(jid, { text: `❌ Could not find lyrics for: *${query}*` });
            }

            // Lyrics are API text — strip control chars and keep the reply
            // well under WhatsApp's safe size ("waiting" fix).
            const shown = clipText(safeText(lyrics), 3300);

            const caption =
                `🎵 *SONG LYRICS*\n━━━━━━━━━━━━━━━━━━━\n` +
                `🎼 *Title:* ${safeText(title)}\n` +
                `👤 *Artist:* ${safeText(artist)}\n` +
                (album ? `💿 *Album:* ${safeText(album)}\n\n` : `\n`) +
                `${shown}\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `_Nexus-1MD Media Hub_`;

            await sock.sendMessage(jid, { text: caption }, { quoted: msg });

        } catch (error) {
            console.error("Lyrics command error:", error);
            await sock.sendMessage(jid, { text: "❌ Oops! Something went wrong while fetching lyrics. Please try again later." });
        }
    }
};
