const audioFx = require("../../lib/audioFx");

// Playback-speed multiplier using ffmpeg `atempo` — pitch is PREserved.
// Values outside 0.25..3.00 rejected to prevent absurd/resource-heavy runs.
module.exports = {
    name: "speed",
    description: "Change playback speed of a replied audio/video (pitch preserved).",
    category: "sound",
    async execute({ sock, jid, msg, args }) {
        const media = await audioFx.safeMedia(sock, jid, msg, "speed", null);
        if (!media) return;

        const rate = audioFx.parseMultiplier(args[0]);
        if (!Number.isFinite(rate) || rate < 0.25 || rate > 3) {
            return await sock.sendMessage(
                jid,
                { text: "⚠️ Usage: `.speed <x>` — speed must be between 0.25 and 3.00\n\n*Examples:*\n▸ `.speed 1.5` (50% faster)\n▸ `.speed 0.5` (half speed)" },
                { quoted: msg }
            );
        }
        if (rate === 1) {
            return await sock.sendMessage(jid, { text: "ℹ️ Speed 1.0 is the original — nothing to change." }, { quoted: msg });
        }

        await sock.sendMessage(jid, { text: `⏳ Applying ${rate}x speed...` }, { quoted: msg });

        try {
            // atempo only accepts 0.5..2.0 per filter — chain it for extremes.
            const chain = [];
            let remaining = rate;
            while (remaining < 0.5) { chain.push(0.5); remaining /= 0.5; }
            while (remaining > 2.0) { chain.push(2.0); remaining /= 2.0; }
            chain.push(Number(remaining.toFixed(6)));
            const filter = chain.map((n) => `atempo=${n}`).join(",");

            const out = await audioFx.runFfmpeg(
                media.buffer,
                ["-vn", "-af", filter, "-acodec", "libmp3lame", "-q:a", "2"],
                { inputExt: "bin", outputExt: "mp3" }
            );
            await audioFx.sendAudio(sock, jid, msg, out, { mimetype: "audio/mpeg" });
        } catch (error) {
            await audioFx.sendError(sock, jid, msg, "speed", error);
        }
    }
};
