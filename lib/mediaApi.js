const axios = require('axios');
const yts = require('yt-search');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Path to bundled yt-dlp binary
const YTDLP_BIN = path.join(__dirname, '..', 'bin', 'yt-dlp.exe');

/**
 * Run yt-dlp with given args. Returns stdout as string.
 */
function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        execFile(YTDLP_BIN, args, { maxBuffer: 200 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout);
        });
    });
}

const AXIOS_OPTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

// ── OxBot Download API ────────────────────────────────────────────────────────
// Base: https://lecay.oxbot.name.ng
// Supports: TikTok, Instagram, Facebook, Twitter/X, LinkedIn
const OXBOT_BASE   = 'https://lecay.oxbot.name.ng';
const OXBOT_API_KEY = process.env.OXBOT_API_KEY || '';

/**
 * Unified OxBot downloader — returns raw API response or null on failure.
 * @param {string} url - The social media URL to download
 */
async function oxbotDownload(url) {
    if (!OXBOT_API_KEY) {
        console.warn('[OxBot] OXBOT_API_KEY not set in .env');
        return null;
    }
    try {
        const endpoint = `${OXBOT_BASE}/api/download.php?api_key=${encodeURIComponent(OXBOT_API_KEY)}&url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(endpoint, AXIOS_OPTS);
        if (data && data.ok && data.download_url) return data;
        console.warn('[OxBot] API error:', data?.error || 'Unknown error');
        return null;
    } catch (err) {
        console.error('[OxBot] Request failed:', err.message);
        return null;
    }
}

/**
 * Fetch the media buffer from a direct URL (with fallback to URL-only).
 * @param {string} mediaUrl
 */
async function bufferFromUrl(mediaUrl) {
    try {
        const res = await axios.get(mediaUrl, { ...AXIOS_OPTS, responseType: 'arraybuffer' });
        return Buffer.from(res.data);
    } catch {
        return null;
    }
}

const mediaApi = {
    /**
     * Search for videos on YouTube
     */
    async ytSearch(query) {
        try {
            const search = await yts(query);
            return search.videos.length > 0 ? search.videos : null;
        } catch (error) {
            console.error('ytSearch error:', error);
            return null;
        }
    },

    /**
     * Download YouTube audio via bundled yt-dlp binary.
     * Most reliable method — handles YouTube's frequent encryption changes.
     */
    async ytDownload(url) {
        const outTemplate = path.join(os.tmpdir(), `yt_audio_${Date.now()}`);
        const outputPath = `${outTemplate}.mp3`;
        try {
            // 1. Get title
            const infoJson = await runYtDlp([
                '--dump-single-json',
                '--no-warnings',
                '--no-check-certificates',
                url
            ]);
            const info = JSON.parse(infoJson);
            const title = info.title || 'audio';

            // 2. Download best audio stream directly (no ffmpeg conversion needed)
            //    yt-dlp will pick m4a or webm — both playable by WhatsApp
            const outWithExt = `${outTemplate}.%(ext)s`;
            await runYtDlp([
                '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
                '--no-warnings',
                '--no-check-certificates',
                '-o', outWithExt,
                url
            ]);

            // Find the actual downloaded file (extension varies)
            const tmpDir = require('os').tmpdir();
            const basename = require('path').basename(outTemplate);
            const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(basename));
            if (files.length === 0) {
                console.error('[ytDownload] Output file not found in tmp');
                return null;
            }
            const actualFile = path.join(tmpDir, files[0]);
            const ext = path.extname(actualFile).toLowerCase();
            const mimetype = ext === '.m4a' ? 'audio/mp4' : ext === '.webm' ? 'audio/webm' : 'audio/mp4';

            const buffer = fs.readFileSync(actualFile);
            fs.unlinkSync(actualFile);
            return { buffer, title, mimetype };
        } catch (err) {
            console.error('[ytDownload] Error:', err.message);
            try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
            return null;
        }
    },


    /**
     * Download Facebook video via OxBot API
     */
    async facebookDownload(url) {
        try {
            const result = await oxbotDownload(url);
            if (!result) return null;
            const buffer = await bufferFromUrl(result.download_url);
            return {
                buffer: buffer || null,
                url: result.download_url,
                title: result.title || 'Facebook Video',
                uploader: result.uploader || null
            };
        } catch (error) {
            console.error('facebookDownload error:', error);
            return null;
        }
    },

    /**
     * Download TikTok video (no watermark) via OxBot API
     */
    async tiktokDownload(url) {
        try {
            const result = await oxbotDownload(url);
            if (!result) return null;
            const buffer = await bufferFromUrl(result.download_url);
            return {
                buffer: buffer || null,
                url: result.download_url,
                author: result.uploader || null,
                title: result.title || null
            };
        } catch (error) {
            console.error('tiktokDownload error:', error);
            return null;
        }
    },

    /**
     * Download Instagram media via OxBot API
     */
    async igDownload(url) {
        try {
            const result = await oxbotDownload(url);
            if (!result) return null;
            const mediaUrl = result.download_url;
            const isVideo = mediaUrl.includes('.mp4') || result.platform === 'instagram';
            const buffer = await bufferFromUrl(mediaUrl);
            return [{ buffer: buffer || null, url: mediaUrl, isVideo }];
        } catch (error) {
            console.error('igDownload error:', error);
            return null;
        }
    },

    /**
     * Download Twitter/X video via OxBot API
     */
    async twitterDownload(url) {
        try {
            const result = await oxbotDownload(url);
            if (!result) return null;
            const buffer = await bufferFromUrl(result.download_url);
            return {
                buffer: buffer || null,
                url: result.download_url,
                title: result.title || 'Twitter/X Video',
                uploader: result.uploader || null
            };
        } catch (error) {
            console.error('twitterDownload error:', error);
            return null;
        }
    },

    /**
     * Download LinkedIn video via OxBot API
     */
    async linkedinDownload(url) {
        try {
            const result = await oxbotDownload(url);
            if (!result) return null;
            const buffer = await bufferFromUrl(result.download_url);
            return {
                buffer: buffer || null,
                url: result.download_url,
                title: result.title || 'LinkedIn Video',
                uploader: result.uploader || null
            };
        } catch (error) {
            console.error('linkedinDownload error:', error);
            return null;
        }
    },

    /**
     * Get lyrics for a song (LRCLIB)
     */
    async getLyrics(query) {
        const queryEncoded = encodeURIComponent(query);
        const sources = [
            // 🔗 Source 1: LRCLIB (Standard / Quality)
            async () => {
                const { data } = await axios.get(`https://lrclib.net/api/search?q=${queryEncoded}`, AXIOS_OPTS);
                if (data && data.length > 0) {
                    const queryLower = query.toLowerCase();
                    let best = data.find(m => m.plainLyrics && (queryLower.includes(m.artistName.toLowerCase()) || queryLower.includes(m.trackName.toLowerCase()))) || data[0];
                    if (best && best.plainLyrics) return { title: best.trackName, artist: best.artistName, lyrics: best.plainLyrics, album: best.albumName };
                }
                throw new Error('LRCLIB: No match');
            },
            // 🔗 Source 2: Vreden (High Reliability)
            async () => {
                const { data } = await axios.get(`https://api.vreden.my.id/api/lyrics?query=${queryEncoded}`, AXIOS_OPTS);
                if (data.status && data.result?.lyrics) return { title: data.result.title, artist: data.result.artist, lyrics: data.result.lyrics };
                throw new Error('Vreden: No match');
            },
            // 🔗 Source 3: Siputzx (Extensive Database)
            async () => {
                const { data } = await axios.get(`https://api.siputzx.my.id/api/s/lyrics?query=${queryEncoded}`, AXIOS_OPTS);
                if (data.status && data.data?.lyrics) return { title: data.data.title, artist: data.data.artist, lyrics: data.data.lyrics };
                throw new Error('Siputzx: No match');
            },
            // 🔗 Source 4: Nabees (Owner's Suite)
            async () => {
                const { data } = await axios.get(`https://api.nabees.online/api/lyrics?q=${queryEncoded}`, AXIOS_OPTS);
                if (data && data.result) return { title: data.result.title || query, artist: data.result.artist || "Unknown", lyrics: data.result.lyrics };
                throw new Error('Nabees: No match');
            }
        ];

        for (const source of sources) {
            try {
                const res = await source();
                if (res && res.lyrics) return res;
            } catch (e) {
                console.warn(`Lyrics Fallback Error: ${e.message}`);
                continue; // Try next source
            }
        }

        return null;
    }
};

module.exports = mediaApi;
