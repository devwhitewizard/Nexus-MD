/**
 * audioFx.js — shared audio-processing helper for the SOUND category.
 *
 * Provides one safe pipeline reused by every sound command:
 *   quoted WhatsApp media -> temp file -> FFmpeg (execFile, arg array, no shell)
 *   -> output buffer -> WhatsApp -> temp dir removed
 *
 * Security notes:
 *  - FFmpeg is always spawned via execFile() with an argument array — raw user
 *    input is never placed in a shell string, never in a filename, never in a path.
 *  - Numeric user values are parsed/clamped by the calling command before they
 *    ever reach a filter string.
 *  - Temporary files live in a per-run directory under os.tmpdir() and are
 *    always removed (success, failure, or timeout).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

let ffmpegPath = "ffmpeg";
try {
    ffmpegPath = require("ffmpeg-static") || "ffmpeg";
} catch (e) {
    ffmpegPath = "ffmpeg";
}

// Public-bot resource limits
const MAX_INPUT_BYTES = 25 * 1024 * 1024;  // 25 MB per input media
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024; // 40 MB per generated file
const FFMPEG_TIMEOUT_MS = 60000;           // hard cap per FFmpeg run

const MEDIA_MIME_RE = /^(audio|video)\//i;

/**
 * Download a quoted audio/video media file.
 * Accepts audio messages, video messages and audio/video documents.
 *
 * @returns {{ buffer: Buffer, mimetype: string, kind: "audio"|"video" } | null}
 *          null when the reply contains no usable audio/video media.
 * @throws Error with code "TOO_LARGE" when the media exceeds MAX_INPUT_BYTES.
 */
async function getQuotedMedia(msg) {
    const quoted =
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
    if (!quoted) return null;

    let mimetype = "";
    if (quoted.audioMessage) mimetype = quoted.audioMessage.mimetype || "";
    else if (quoted.videoMessage) mimetype = quoted.videoMessage.mimetype || "";
    else if (quoted.documentMessage) mimetype = quoted.documentMessage.mimetype || "";

    if (!MEDIA_MIME_RE.test(mimetype)) return null;

    const buffer = await downloadMediaMessage(
        { message: quoted },
        "buffer",
        {},
        { logger: console }
    );
    if (!buffer || !buffer.length) return null;

    if (buffer.length > MAX_INPUT_BYTES) {
        const err = new Error("Quoted media exceeds MAX_INPUT_BYTES");
        err.code = "TOO_LARGE";
        throw err;
    }

    const kind = MEDIA_MIME_RE.test(mimetype) && /^audio/i.test(mimetype)
        ? "audio"
        : "video";
    return { buffer, mimetype, kind };
}

/**
 * Fetch + validate a quoted media for a command, replying usage guidance
 * itself when media is missing / wrong kind / too big so commands stay tiny.
 *
 * @param {string} cmd     command name (for the usage hint text)
 * @param {"audio"|"video"|null} wanted  required kind, or null to accept both
 * @returns media object or null (a reply has already been sent when null)
 */
async function safeMedia(sock, jid, msg, cmd, wanted) {
    let media = null;
    try {
        media = await getQuotedMedia(msg);
    } catch (e) {
        if (e && e.code === "TOO_LARGE") {
            await sendTooLarge(sock, jid, msg);
            return null;
        }
        console.error("[audioFx] media download failed:", (e && e.message) || e);
        await sock.sendMessage(
            jid,
            { text: "❌ Couldn't download that media. Please try again later." },
            { quoted: msg }
        );
        return null;
    }

    if (!media) {
        const article = wanted === "video" ? "a" : "an";
        const noun = wanted || "audio";
        await sock.sendMessage(
            jid,
            {
                text:
                    `❌ No ${noun} found.\n\n` +
                    `Reply to ${article} ${noun} and use:\n.${cmd}`
            },
            { quoted: msg }
        );
        return null;
    }

    if (wanted && media.kind !== wanted) {
        const other = wanted === "video" ? "audio" : "video";
        await sock.sendMessage(
            jid,
            {
                text:
                    `❌ This is a ${media.kind} file, not a ${wanted}.\n\n` +
                    `Reply to a ${wanted} and use:\n.${cmd}\n\n` +
                    `(or use .${cmd} on a ${other} source first)`
            },
            { quoted: msg }
        );
        return null;
    }

    return media;
}

/**
 * Run an FFmpeg job on an input buffer.
 *
 * @param {Buffer} inputBuffer raw media bytes
 * @param {string[]} args      FFmpeg arguments placed BETWEEN -i and the output
 *                             file (e.g. ["-vn","-acodec","libmp3lame"]).
 * @param {object} opts        { inputExt, outputExt, timeoutMs }
 * @returns {Promise<Buffer>}  processed output bytes
 */
function runFfmpeg(inputBuffer, args, opts = {}) {
    const inputExt = opts.inputExt || "bin";
    const outputExt = opts.outputExt || "mp3";
    const timeoutMs = opts.timeoutMs || FFMPEG_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        const tempDir = path.join(
            os.tmpdir(),
            `nexus-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        );
        let settled = false;

        const cleanup = () => {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { /* noqa */ }
        };

        const fail = (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        };

        try {
            fs.mkdirSync(tempDir, { recursive: true });
        } catch (e) {
            return fail(e);
        }

        const inputPath = path.join(tempDir, `input.${inputExt}`);
        const outputPath = path.join(tempDir, `output.${outputExt}`);

        try {
            fs.writeFileSync(inputPath, inputBuffer);
        } catch (e) {
            return fail(e);
        }

        // Argument array only — no shell, no string interpolation.
        const fullArgs = [
            "-hide_banner", "-loglevel", "error", "-y",
            "-i", inputPath,
            ...args,
            outputPath
        ];

        execFile(
            ffmpegPath,
            fullArgs,
            { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
            (err) => {
                if (err) {
                    const e = new Error("FFmpeg processing failed");
                    e.code = err.code || "FFMPEG";
                    return fail(e);
                }
                try {
                    const out = fs.readFileSync(outputPath);
                    cleanup();
                    if (out.length > MAX_OUTPUT_BYTES) {
                        const e = new Error("Generated audio too large to send");
                        e.code = "TOO_LARGE";
                        return fail(e);
                    }
                    if (!out.length) {
                        const e = new Error("FFmpeg produced empty output");
                        e.code = "FFMPEG";
                        return fail(e);
                    }
                    resolve(out);
                } catch (e) {
                    fail(e);
                }
            }
        );
    });
}

/**
 * Detect the sample rate of an audio buffer (used by .pitch for accurate
 * asetrate compensation). Falls back to 44100 when detection fails.
 */
function probeSampleRate(inputBuffer, ext = "bin") {
    return new Promise((resolve) => {
        const fallback = 44100;
        let tempDir;
        try {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-probe-"));
        } catch (e) {
            return resolve(fallback);
        }
        const inputPath = path.join(tempDir, `input.${ext}`);
        try { fs.writeFileSync(inputPath, inputBuffer); } catch (e) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e2) { /* noqa */ }
            return resolve(fallback);
        }

        execFile(
            ffmpegPath,
            ["-hide_banner", "-i", inputPath, "-f", "null", "-"],
            { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 },
            (err, stdout, stderr) => {
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { /* noqa */ }
                const text = `${stderr || ""}${stdout || ""}`;
                const m = text.match(/Audio:[^\n]*?(\d{3,6})\s*Hz/i);
                const rate = m ? parseInt(m[1], 10) : NaN;
                resolve(Number.isFinite(rate) && rate >= 8000 && rate <= 192000 ? rate : fallback);
            }
        );
    });
}

/**
 * Send an audio buffer back to the chat.
 * @param {boolean} opts.ptt  deliver as a push-to-talk voice note
 */
async function sendAudio(sock, jid, msg, buffer, opts = {}) {
    const payload = {
        audio: buffer,
        mimetype: opts.mimetype || "audio/mpeg",
        ptt: !!opts.ptt
    };
    if (opts.fileName) payload.fileName = opts.fileName;
    await sock.sendMessage(jid, payload, { quoted: msg });
}

/** Friendly "media too large" notice (spec §22). */
async function sendTooLarge(sock, jid, msg) {
    await sock.sendMessage(
        jid,
        {
            text:
                `❌ Audio is too large to process.\n\n` +
                `Maximum supported size: ${MAX_INPUT_BYTES / (1024 * 1024)} MB`
        },
        { quoted: msg }
    );
}

/** Log server-side, send a short user-friendly message, never leak internals (spec §24). */
async function sendError(sock, jid, msg, context, error) {
    console.error(`[audioFx] ${context}:`, (error && (error.stack || error.message)) || error);
    const text =
        error && error.message === "Generated audio too large to send"
            ? "❌ The processed audio is too large to send. Try a shorter/smaller file."
            : "❌ Audio processing failed. Please try again later.";
    await sock.sendMessage(jid, { text }, { quoted: msg });
}

/** Parse a floating-point multiplier ("1.5") safely; returns NaN when absent/invalid. */
function parseMultiplier(raw) {
    if (typeof raw !== "string" || raw.length > 12) return NaN;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : NaN;
}

module.exports = {
    ffmpegPath,
    MAX_INPUT_BYTES,
    MAX_OUTPUT_BYTES,
    FFMPEG_TIMEOUT_MS,
    getQuotedMedia,
    safeMedia,
    runFfmpeg,
    probeSampleRate,
    sendAudio,
    sendTooLarge,
    sendError,
    parseMultiplier
};
