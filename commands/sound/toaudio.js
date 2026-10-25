const audioFx = require("../../lib/audioFx");

module.exports = {
    name: "toaudio",
    description: "Extract the audio track from a replied video.",
    category: "sound",
    async execute({ sock, jid, msg }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "toaudio", "video");
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
            await audioFx.sendError(sock, jid, msg, "toaudio", error);
        }
    }
};
