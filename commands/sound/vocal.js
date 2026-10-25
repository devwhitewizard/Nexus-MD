const audioFx = require("../../lib/audioFx");
const vocalSeparator = require("../../lib/vocalSeparator");

// `.vocal` — vocal/instrumental separation via the dedicated provider
// (lib/vocalSeparator.js). FFmpeg is NOT used for the separation itself —
// when the service is not configured we say so instead of faking success.
module.exports = {
    name: "vocal",
    description: "Separate vocals and instrumental from a replied audio/video.",
    category: "sound",
    cooldown: 20000,
    async execute({ sock, jid, msg }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "vocal", null);
        if (!media) return;

        await sock.sendMessage(jid, { text: "⏳ Separating vocals..." }, { quoted: msg });

        const result = await vocalSeparator.separate(media.buffer, media.mimetype);

        if (result.configured === false) {
            return await sock.sendMessage(
                jid,
                {
                    text: "⚠️ Vocal separation is not configured yet.\n\n" +
                        "Real vocal separation needs a dedicated separation service — FFmpeg alone can't do it.\n" +
                        "Set `VOCAL_API_URL` on the server to enable this command."
                },
                { quoted: msg }
            );
        }
        if (result.tooLarge) {
            return await audioFx.sendTooLarge(sock, jid, msg);
        }
        if (result.unreachable) {
            return await sock.sendMessage(
                jid,
                { text: "⚠️ The separation service failed or is unreachable. Please try again later." },
                { quoted: msg }
            );
        }

        try {
            await sock.sendMessage(jid, { text: "🎤 Sending vocal track..." }, { quoted: msg });
            await audioFx.sendAudio(sock, jid, msg, result.vocal, { mimetype: "audio/mpeg" });
            await sock.sendMessage(jid, { text: "🎸 Sending instrumental track..." }, { quoted: msg });
            await audioFx.sendAudio(sock, jid, msg, result.instrumental, { mimetype: "audio/mpeg" });
        } catch (error) {
            await audioFx.sendError(sock, jid, msg, "vocal", error);
        }
    }
};
