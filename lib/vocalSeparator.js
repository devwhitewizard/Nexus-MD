/**
 * vocalSeparator.js — vocal/instrumental separation service used by `.vocal`.
 *
 * FFmpeg alone CANNOT perform real vocal separation — this always requires a
 * dedicated separation engine/endpoint. This module is a thin, safe provider
 * abstraction:
 *
 *   VOCAL_API_URL  — HTTPS endpoint. The command POSTs the raw audio file as
 *                    the request body (Content-Type: audio/*) and expects a
 *                    JSON response containing:
 *                      { vocalUrl, instrumentalUrl }
 *   VOCAL_API_KEY  — optional; sent as `Authorization: Bearer <key>`
 *
 * Nothing configured → { configured: false } and `.vocal` explains exactly
 * that instead of pretending separation succeeded.
 *
 * Client-side protections: upload size cap, response timeout, download size
 * caps, no shell, no filesystem temps (buffers only), credentials never
 * logged.
 */

const axios = require("axios");

const UPLOAD_TIMEOUT_MS = 120000;   // separation can take a while server-side
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_TRACK_BYTES = 30 * 1024 * 1024; // per returned track

/**
 * @param {Buffer} audioBuffer
 * @param {string} [mimetype]
 * @returns {Promise<{
 *   configured?: boolean,
 *   vocal?: Buffer,
 *   instrumental?: Buffer,
 *   unreachable?: boolean
 * }>}
 */
async function separate(audioBuffer, mimetype = "audio/mpeg") {
    const url = process.env.VOCAL_API_URL;
    if (!url || !/^https:\/\//i.test(url)) return { configured: false };

    if (!Buffer.isBuffer(audioBuffer) || !audioBuffer.length) return { unreachable: true };
    if (audioBuffer.length > MAX_UPLOAD_BYTES) return { tooLarge: true, unreachable: true };

    const headers = { "Content-Type": mimetype };
    if (process.env.VOCAL_API_KEY) {
        headers.Authorization = `Bearer ${process.env.VOCAL_API_KEY}`;
    }

    try {
        const response = await axios.post(url, audioBuffer, {
            headers,
            timeout: UPLOAD_TIMEOUT_MS,
            maxContentLength: 10 * 1024 * 1024 // JSON body with two URLs
        });

        const body = response.data || {};
        const vocalUrl = typeof body.vocalUrl === "string" ? body.vocalUrl : "";
        const instaUrl = typeof body.instrumentalUrl === "string" ? body.instrumentalUrl : "";
        if (!/^https:\/\//i.test(vocalUrl) || !/^https:\/\//i.test(instaUrl)) {
            return { unreachable: true };
        }

        const [vocal, instrumental] = await Promise.all([
            downloadTrack(vocalUrl),
            downloadTrack(instaUrl)
        ]);
        if (!vocal || !instrumental) return { unreachable: true };

        return { vocal, instrumental };
    } catch (error) {
        return { unreachable: true, message: (error && error.message) || "separation failed" };
    }
}

/**
 * Download one generated track with a hard size cap and timeout.
 * Only exact-URL downloads from the provider response; user input never
 * reaches this function.
 */
async function downloadTrack(trackUrl) {
    try {
        const head = await axios.head(trackUrl, { timeout: 8000 });
        const len = parseInt(head.headers && head.headers["content-length"], 10);
        if (Number.isFinite(len) && len > MAX_TRACK_BYTES) return null;
    } catch (e) { /* HEAD unsupported is fine — cap still applied below */ }

    try {
        const response = await axios.get(trackUrl, {
            responseType: "arraybuffer",
            timeout: 120000,
            maxContentLength: MAX_TRACK_BYTES
        });
        const buf = Buffer.from(response.data);
        return buf.length && buf.length <= MAX_TRACK_BYTES ? buf : null;
    } catch (error) {
        return null;
    }
}

module.exports = { separate };
