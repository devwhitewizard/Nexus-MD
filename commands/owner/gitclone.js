const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

module.exports = {
    name: "gitclone",
    aliases: ["clone", "gc", "github"],
    description: "Download a GitHub/Git repository and send it to WhatsApp as a ZIP document.",
    category: "owner",
    isOwnerOnly: true,
    cooldown: 15000,
    async execute({ sock, jid, args, msg }) {
        let input = args[0];

        if (!input) {
            return await sock.sendMessage(jid, {
                text: `📦 *Git Clone / GitHub Downloader*\n\n*Usage:* \`.gitclone <github_url_or_repo>\`\n\n*Examples:*\n\`.gitclone https://github.com/user/repo\`\n\`.gitclone user/repo\`\n\n_Clones the repo and sends it directly to WhatsApp as a .zip document!_`
            }, { quoted: msg });
        }

        input = input.trim();
        let owner = '';
        let repo = '';

        // Match github url or user/repo format
        const ghMatch = input.match(/(?:https?:\/\/github\.com\/|git@github\.com:)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
        if (ghMatch) {
            owner = ghMatch[1];
            repo = ghMatch[2].replace(/\.git$/, '');
        }

        const repoName = repo || path.basename(input.replace(/\.git$/, '')) || 'repository';

        await sock.sendMessage(jid, {
            text: `⏳ *Fetching repository: \`${repoName}\`...*\n\n_Please wait while the repository is downloaded and sent to WhatsApp..._`
        }, { quoted: msg });

        let zipBuffer = null;

        // Strategy 1: Try GitHub API Zipball (Fastest, works cross-platform without local git/zip dependencies)
        if (owner && repo) {
            try {
                const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball`;
                const res = await axios.get(zipUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 60000,
                    maxRedirects: 5
                });

                if (res.data && res.data.length > 0) {
                    zipBuffer = Buffer.from(res.data);
                }
            } catch (err) {
                console.log(`[gitclone] Direct GitHub zip download failed (${err.message}). Falling back to git clone...`);
            }
        }

        // Strategy 2: Fallback to local git clone + zipping if direct download failed or non-GitHub URL
        if (!zipBuffer) {
            const tempDir = path.join(os.tmpdir(), `gitclone-${Date.now()}`);
            const zipPath = path.join(os.tmpdir(), `${repoName}-${Date.now()}.zip`);

            try {
                const cloneUrl = input.startsWith('http') || input.startsWith('git@') ? input : `https://github.com/${owner}/${repo}.git`;

                // Clone repo into temp dir with depth 1
                execSync(`git clone --depth 1 "${cloneUrl}" "${tempDir}"`, { stdio: 'pipe' });

                // Zip the temporary folder based on OS
                if (process.platform === 'win32') {
                    execSync(`powershell -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
                } else {
                    execSync(`cd "${tempDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
                }

                if (fs.existsSync(zipPath)) {
                    zipBuffer = fs.readFileSync(zipPath);
                }
            } catch (cloneErr) {
                return await sock.sendMessage(jid, {
                    text: `❌ *Failed to clone/download repository.*\n\n*Error:* ${cloneErr.message}`
                }, { quoted: msg });
            } finally {
                // Clean up temporary files
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
                if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { recursive: true, force: true });
            }
        }

        if (!zipBuffer || zipBuffer.length === 0) {
            return await sock.sendMessage(jid, {
                text: `❌ *Could not download repository content.*`
            }, { quoted: msg });
        }

        // Check buffer size (WhatsApp document limit ~100MB)
        const sizeMB = (zipBuffer.length / (1024 * 1024)).toFixed(2);
        if (zipBuffer.length > 100 * 1024 * 1024) {
            return await sock.sendMessage(jid, {
                text: `⚠️ *Repository ZIP is too large for WhatsApp.* (${sizeMB} MB). Max allowed is 100MB.`
            }, { quoted: msg });
        }

        // Send ZIP document to WhatsApp chat
        await sock.sendMessage(jid, {
            document: zipBuffer,
            fileName: `${repoName}.zip`,
            mimetype: 'application/zip',
            caption: `📦 *GitHub Repository Downloaded*\n\n📁 *File:* \`${repoName}.zip\`\n📊 *Size:* \`${sizeMB} MB\`\n🔗 *URL:* ${input}`
        }, { quoted: msg });
    }
};

