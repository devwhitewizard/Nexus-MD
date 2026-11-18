const axios = require('axios');
const yts = require('yt-search');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── yt-dlp binary resolution (cross-platform) ────────────────────────────────
// The repo only ships bin/yt-dlp.exe (Windows). On Linux/macOS servers we pick
// the matching standalone release and download it into bin/ on first use.
const BIN_DIR = path.join(__dirname, '..', 'bin');

function ytDlpAssetName() {
    if (process.platform === 'win32') return 'yt-dlp.exe';
    if (process.platform === 'darwin') return 'yt-dlp_macos';
    if (process.arch === 'arm64') return 'yt-dlp_linux_aarch64';
    if (process.arch === 'arm') return 'yt-dlp_linux_armv7l';
    return 'yt-dlp_linux';
}

async function downloadYtDlp(dest, asset) {
    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
    console.log(`[yt-dlp] Downloading ${asset} ...`);
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 5 });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    fs.writeFileSync(tmp, Buffer.from(res.data));
    fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, dest);
    console.log(`[yt-dlp] Installed at ${dest}`);
}

let ytDlpBinPromise = null;
function getYtDlpBin() {
    if (ytDlpBinPromise) return ytDlpBinPromise;
    ytDlpBinPromise = (async () => {
        if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;

        const asset = ytDlpAssetName();
        const local = path.join(BIN_DIR, asset);
        if (fs.existsSync(local)) {
            if (process.platform !== 'win32') { try { fs.chmodSync(local, 0o755); } catch {} }
            return local;
        }

        try {
            await downloadYtDlp(local, asset);
            return local;
        } catch (err) {
            console.warn(`[yt-dlp] Auto-download failed (${err.message}); falling back to system "yt-dlp" in PATH`);
            return 'yt-dlp';
        }
    })();
    // Don't cache a failed PATH fallback forever — allow retry on next call
    ytDlpBinPromise.then(bin => { if (bin === 'yt-dlp') ytDlpBinPromise = null; });
    return ytDlpBinPromise;
}

/**
 * Run yt-dlp with given args. Returns stdout as string.
 */
async function runYtDlp(args) {
    const bin = await getYtDlpBin();
    return new Promise((resolve, reject) => {
        execFile(bin, args, { maxBuffer: 200 * 1024 * 1024, timeout: 180000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || err.message || '').trim()));
            resolve(stdout);
        });
    });
}

function ytDlpCommonArgs() {
    const args = ['--no-warnings', '--no-check-certificates', '--no-playlist'];
    // Optional cookies file — helps on datacenter IPs that YouTube flags as bots
    const cookies = process.env.YTDLP_COOKIES;
    if (cookies && fs.existsSync(cookies)) args.push('--cookies', cookies);
    return args;
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

function mimeFromExt(ext) {
    if (ext === '.webm' || ext === '.opus') return 'audio/webm';
    if (ext === '.mp3') return 'audio/mpeg';
    return 'audio/mp4';
}

/**
 * Download best audio via yt-dlp in a single call (title + file path printed).
 */
async function ytDownloadViaYtDlp(url) {
    const tmpDir = os.tmpdir();
    const base = `yt_audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cleanup = () => {
        try {
            for (const f of fs.readdirSync(tmpDir)) if (f.startsWith(base)) fs.unlinkSync(path.join(tmpDir, f));
        } catch {}
    };
    try {
        const stdout = await runYtDlp([
            ...ytDlpCommonArgs(),
            '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
            '-o', path.join(tmpDir, `${base}.%(ext)s`),
            '--no-simulate',
            '--print', 'title',
            '--print', 'after_move:filepath',
            url
        ]);
        const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const title = lines[0] || 'audio';
        let file = lines[lines.length - 1];
        if (!file || !fs.existsSync(file)) {
            const found = fs.readdirSync(tmpDir).find(f => f.startsWith(base) && !f.endsWith('.part'));
            file = found ? path.join(tmpDir, found) : null;
        }
        if (!file) throw new Error('Output file not found');

        const buffer = fs.readFileSync(file);
        const mimetype = mimeFromExt(path.extname(file).toLowerCase());
        cleanup();
        return { buffer, title, mimetype };
    } catch (err) {
        console.error('[ytDownload:yt-dlp] Error:', err.message);
        cleanup();
        return null;
    }
}

/**
 * Pure-JS fallback using @distube/ytdl-core.
 */
async function ytDownloadViaYtdlCore(url) {
    try {
        const ytdl = require('@distube/ytdl-core');
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
        const chunks = [];
        await new Promise((resolve, reject) => {
            const stream = ytdl.downloadFromInfo(info, { format, highWaterMark: 1 << 25 });
            stream.on('data', c => chunks.push(c));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) throw new Error('Empty stream');
        const mimetype = (format.mimeType || '').includes('webm') ? 'audio/webm' : 'audio/mp4';
        return { buffer, title: info.videoDetails?.title || 'audio', mimetype };
    } catch (err) {
        console.error('[ytDownload:ytdl-core] Error:', err.message);
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
        // 1) yt-dlp (primary)
        const viaYtDlp = await ytDownloadViaYtDlp(url);
        if (viaYtDlp) return viaYtDlp;

        // 2) @distube/ytdl-core (pure JS fallback)
        const viaYtdl = await ytDownloadViaYtdlCore(url);
        if (viaYtdl) return viaYtdl;

        // 3) OxBot API (last resort, if it supports the link)
        try {
            const result = await oxbotDownload(url);
            if (result) {
                const buffer = await bufferFromUrl(result.download_url);
                return { buffer: buffer || null, url: result.download_url, title: result.title || 'audio', mimetype: 'audio/mp4' };
            }
        } catch {}

        return null;
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
