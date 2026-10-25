const audioFx = require("../../lib/audioFx");

// Shares the single video→audio helper with `.toaudio` — one implementation,
// two command names.
module.exports = {
    name: "audio",
    description: "Extract the audio track from a replied video.",
    category: "sound",
    async execute({ sock, jid, msg }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "audio", "video");
        if (!media) return;

        await sock.sendMessage(jid, { text: "⏳ Extracting audio..." }, { quoted: msg });

        try {
            const out = await audioFx.runFfmpeg(
                media.buffer,
                ["-vn", "-acodec", "libmp3lame", "-q:a", "2"],
                { inputExt: "mp4", outputExt: "mp3" }
            );
            await audioFx.sendAudio(sock, jid, msg, out, { mimetype: "audio/mpeg" });
        } catch (error) {
            await audioFx.sendError(sock, jid, msg, "audio", error);
        }
    }
};
