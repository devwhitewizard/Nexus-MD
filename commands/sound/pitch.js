const audioFx = require("../../lib/audioFx");

// Pitch multiplier using the classic asetrate trick:
//   asetrate=<rate*r> , aresample=<rate> , atempo=<1/r>
// → pitch shifts by r while duration/tempo stays unchanged.
// The source sample rate is detected first (falls back to 44100).
module.exports = {
    name: "pitch",
    description: "Change the pitch of a replied audio/video (e.g. 1.5 = +50%, duration preserved).",
    category: "sound",
    async execute({ sock, jid, msg, args }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "pitch", null);
        if (!media) return;

        const ratio = audioFx.parseMultiplier(args[0]);
        if (!Number.isFinite(ratio) || ratio < 0.5 || ratio > 2) {
            return await sock.sendMessage(
                jid,
                { text: "⚠️ Usage: `.pitch <x>` — pitch multiplier between 0.5 and 2.0 (1.0 = original)\n\n*Examples:*\n▸ `.pitch 1.5` (higher pitch)\n▸ `.pitch 0.8` (lower pitch)" },
                { quoted: msg }
            );
        }
        if (ratio === 1) {
            return await sock.sendMessage(jid, { text: "ℹ️ Pitch 1.0 is the original — nothing to change." }, { quoted: msg });
        }

        await sock.sendMessage(jid, { text: `⏳ Shifting pitch by ${ratio}x...` }, { quoted: msg });

        try {
            const rate = await audioFx.probeSampleRate(media.buffer, "bin");
            const shifted = Math.round(rate * ratio);
            const filter = `asetrate=${shifted},aresample=${rate},atempo=${(1 / ratio).toFixed(6)}`;

            const out = await audioFx.runFfmpeg(
                media.buffer,
                ["-vn", "-af", filter, "-acodec", "libmp3lame", "-q:a", "2"],
                { inputExt: "bin", outputExt: "mp3" }
            );
            await audioFx.sendAudio(sock, jid, msg, out, { mimetype: "audio/mpeg" });
        } catch (error) {
            await audioFx.sendError(sock, jid, msg, "pitch", error);
        }
    }
};
