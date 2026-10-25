/**
 * songIdentifier.js — internal song-identification service used by BOTH
 * `.sauce` and `.shazam` (one implementation, two command names).
 *
 * Provider abstraction. Nothing is hardcoded: credentials come from the
 * environment only. When no provider is configured, identify() returns
 * { configured: false } and the commands show a clear message instead of
 * pretending identification worked locally (no offline "magic" matching).
 *
 * Supported provider (configure via environment):
 *   AUDD_API_TOKEN  — audd.io API token (https://docs.audd.io)
 *                     the audio file is POSTed as multipart/form-data
 *
 * Timeout is enforced; responses are size-capped; failures are returned as
 * plain fields — never thrown — so commands can keep replies user-friendly.
 */

const axios = require("axios");

const IDENTIFY_TIMEOUT_MS = 45000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const API_URL = "https://api.audd.io/";

/**
 * @param {Buffer} audioBuffer
 * @param {string} [mimetype]
 * @returns {Promise<{
 *   configured?: boolean,
 *   found?: boolean,
 *   unreachable?: boolean,
 *   title?: string, artist?: string, album?: string, year?: string, link?: string
 * }>}
 */
async function identify(audioBuffer, mimetype = "audio/mpeg") {
    const token = process.env.AUDD_API_TOKEN;
    if (!token) return { configured: false };

    if (!Buffer.isBuffer(audioBuffer) || !audioBuffer.length) return { found: false };
    if (audioBuffer.length > MAX_UPLOAD_BYTES) return { found: false, tooLarge: true };

    try {
        // Keep everything in axios multipart form-data (no shell, no temp files).
        const FormData = require("form-data");
        const form = new FormData();
        form.append("api_token", token);
        form.append("file", audioBuffer, { filename: "audio.bin", contentType: mimetype });
        form.append("return", "apple_music,spotify");

        const response = await axios.post(API_URL, form, {
            headers: form.getHeaders(),
            timeout: IDENTIFY_TIMEOUT_MS,
            maxContentLength: 5 * 1024 * 1024
        });

        const body = response.data || {};
        const result = body.result;

        if (body.status !== "success" || !result || !result.title) {
            return { found: false };
        }

        return {
            found: true,
            title: String(result.title).slice(0, 120),
            artist: result.artist ? String(result.artist).slice(0, 120) : "",
            album: result.album ? String(result.album).slice(0, 120) : "",
            // audd reports the release date ("2019-11-08") — keep the year only
            year: result.release_date ? String(result.release_date).slice(0, 4) : "",
            link:
                (Array.isArray(result.spotify) && result.spotify[0] && result.spotify[0].external_url) ||
                (Array.isArray(result.apple_music) && result.apple_music[0] && result.apple_music[0].url) ||
                ""
        };
    } catch (error) {
        return {
            found: false,
            unreachable: true,
            message: (error && error.message) || "identify request failed"
        };
    }
}

module.exports = { identify };
