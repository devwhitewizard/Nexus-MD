const audioFx = require("../../lib/audioFx");

// Bass boost via ffmpeg's `bass` (low-shelf) filter on a sane default.
// Optional numeric boost is parsed + clamped — never passed through raw.
module.exports = {
    name: "bass",
    description: "Boost the bass of a replied audio/video.",
    category: "sound",
    async execute({ sock, jid, msg, args }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "bass", null);
        if (!media) return;

        // default +6 dB; optional `.bass 10` → clamp to 1..15 dB
        const raw = audioFx.parseMultiplier(args[0]);
        const gain = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 15) : 6;

        await sock.sendMessage(jid, { text: "⏳ Boosting bass..." }, { quoted: msg });

        try {
            const out = await audioFx.runFfmpeg(
                media.buffer,
                ["-vn", "-af", `bass=g=${gain.toFixed(1)}:f=110`, "-acodec", "libmp3lame", "-q:a", "2"],
                { inputExt: "bin", outputExt: "mp3" }
            );
            await audioFx.sendAudio(sock, jid, msg, out, { mimetype: "audio/mpeg" });
        } catch (error) {
            await audioFx.sendError(sock, jid, msg, "bass", error);
        }
    }
};
