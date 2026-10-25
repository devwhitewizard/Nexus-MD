const audioFx = require("../../lib/audioFx");

// Reverse audio in place with ffmpeg's `areverse` (no external API needed).
module.exports = {
    name: "reverse",
    description: "Play a replied audio/video backwards.",
    category: "sound",
    async execute({ sock, jid, msg }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "reverse", null);
        if (!media) return;

        await sock.sendMessage(jid, { text: "⏳ Reversing audio..." }, { quoted: msg });

        try {
            const out = await audioFx.runFfmpeg(
                media.buffer,
                ["-vn", "-af", "areverse", "-acodec", "libmp3lame", "-q:a", "2"],
                { inputExt: "bin", outputExt: "mp3" }
            );
            await audioFx.sendAudio(sock, jid, msg, out, { mimetype: "audio/mpeg" });
        } catch (error) {
            await audioFx.sendError(sock, jid, msg, "reverse", error);
        }
    }
};
