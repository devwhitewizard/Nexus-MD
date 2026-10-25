const audioFx = require("../../lib/audioFx");

// Audio OR video -> WhatsApp voice note (PTT, OPUS/OGG).
// Takes over the old `.tovn` alias: `.toaudio` now returns a plain audio file.
module.exports = {
    name: "tovoice",
    aliases: ["tovn"],
    description: "Convert a replied audio/video into a WhatsApp voice note (PTT).",
    category: "sound",
    async execute({ sock, jid, msg }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "tovoice", null);
        if (!media) return;

        await sock.sendMessage(jid, { text: "⏳ Converting to voice note..." }, { quoted: msg });

        try {
            const out = await audioFx.runFfmpeg(
                media.buffer,
                ["-vn", "-acodec", "libopus", "-b:a", "64k", "-ar", "48000"],
                { inputExt: "bin", outputExt: "ogg" }
            );
            await audioFx.sendAudio(sock, jid, msg, out, {
                mimetype: "audio/ogg; codecs=opus",
                ptt: true
            });
        } catch (error) {
            await audioFx.sendError(sock, jid, msg, "tovoice", error);
        }
    }
};
