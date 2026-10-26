/**
 * .update — pulls the LATEST build of the WRAPPER REPO (nexus-v1md).
 * Detects changes between the deployed copy and GitHub, and applies them.
 *
 * Privacy: NOTHING about commits (SHA/message/author) is ever shown to users —
 * only version numbers and the number of pending updates.
 *
 * Important: after pulling code, `npm install` always runs, because the
 * engine (nexus-md) is installed by the wrapper via its package.json pin.
 */

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const UPSTREAM_REPO = "https://github.com/devwhitewizard/nexus-v1md.git";
const UPSTREAM_RAW = "https://raw.githubusercontent.com/devwhitewizard/nexus-v1md/main";
const UPSTREAM_BRANCH = "main";
const rootDir = path.join(__dirname, "../..");

// npm on Windows is npm.cmd — execFile needs the exact binary
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";

/** execFile wrapped as a promise; resolves { ok, stdout, stderr } */
function runCmd(bin, args, opts = {}) {
    return new Promise((resolve) => {
        execFile(
            bin,
            args,
            { cwd: rootDir, windowsHide: true, maxBuffer: 10 * 1024 * 1024, ...opts },
            (err, stdout, stderr) => resolve({ ok: !err, stdout: (stdout || "").trim(), stderr: (stderr || "").trim(), err })
        );
    });
}

/** Local wrapper version (package.json in the deployed repo). */
function localVersion() {
    try { return require("../../package.json").version || "unknown"; }
    catch (e) { return "unknown"; }
}

module.exports = {
    name: "update",
    aliases: ["up", "upgrade"],
    description: "Check / apply the latest bot update from GitHub.",
    category: "owner",
    isOwnerOnly: true,
    execute: async ({ sock, jid, msg, args }) => {
        const subCommand = args[0] ? args[0].toLowerCase() : "";

        if (!subCommand || subCommand === "check") {
            await sock.sendMessage(jid, { text: "🔍 *Checking GitHub for the latest bot build...*" }, { quoted: msg });

            const ver = localVersion();
            const hasGit = fs.existsSync(path.join(rootDir, ".git"));

            // Preferred: git-based change detection (exact, no API rate limits)
            if (hasGit) {
                const head = await runCmd("git", ["rev-parse", "HEAD"]);
                const remote = await runCmd("git", ["ls-remote", "origin", UPSTREAM_BRANCH]);
                const remoteSha = remote.ok ? (remote.stdout.split(/\s+/)[0] || "") : "";

                if (remote.ok && head.ok && remoteSha && remoteSha !== head.stdout) {
                    const fetchRes = await runCmd("git", ["fetch", "origin", UPSTREAM_BRANCH]);
                    let count = "";
                    if (fetchRes.ok) {
                        const cnt = await runCmd("git", ["rev-list", "--count", "HEAD..FETCH_HEAD"]);
                        if (cnt.ok) count = cnt.stdout;
                    }

                    const statusMsg =
                        `🔄 *Nexus-MD Update Check*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n\n` +
                        `📦 *Installed:* \`v${ver}\`\n` +
                        `🌐 *GitHub:* up to date? ❌ No\n` +
                        `⬆️ *Updates behind:* \`${count || "several"}\`\n\n` +
                        `🚀 *Reply with:* \`.update now\` to apply the latest build.`;
                    return await sock.sendMessage(jid, { text: statusMsg }, { quoted: msg });
                }

                if (remote.ok && head.ok && remoteSha === head.stdout) {
                    return await sock.sendMessage(
                        jid,
                        { text: `✅ *Bot is up to date* (\`v${ver}\`)\n\nYou are running the latest build from GitHub.` },
                        { quoted: msg }
                    );
                }
                // git failed → fall through to the version-only check
            }

            // Fallback (no .git): compare deployed package.json version with GitHub
            try {
                const res = await axios.get(`${UPSTREAM_RAW}/package.json`, { timeout: 10000 });
                const remoteVersion = res.data?.version || "unknown";
                if (remoteVersion !== ver) {
                    const statusMsg =
                        `🔄 *Nexus-MD Update Check*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n\n` +
                        `📦 *Installed:* \`v${ver}\`\n` +
                        `🌐 *Latest on GitHub:* \`v${remoteVersion}\`\n\n` +
                        `🚀 *Reply with:* \`.update now\` to update the bot.`;
                    return await sock.sendMessage(jid, { text: statusMsg }, { quoted: msg });
                }
                return await sock.sendMessage(
                    jid,
                    { text: `✅ *Bot is up to date* (\`v${ver}\`)` },
                    { quoted: msg }
                );
            } catch (err) {
                return await sock.sendMessage(
                    jid,
                    { text: "❌ Couldn't reach GitHub right now. Please try again later." },
                    { quoted: msg }
                );
            }
        }

        // ── .update now / force ─────────────────────────────────────────────
        await sock.sendMessage(jid, { text: "🚀 *Applying the latest update... please wait.*" }, { quoted: msg });

        const hasGit = fs.existsSync(path.join(rootDir, ".git"));

        if (hasGit) {
            const reset = await runCmd("git", ["fetch", "origin", UPSTREAM_BRANCH]);
            if (!reset.ok) {
                return await sock.sendMessage(
                    jid,
                    { text: "❌ Couldn't reach GitHub. Please try `.update now` again later." },
                    { quoted: msg }
                );
            }

            const hard = await runCmd("git", ["reset", "--hard", "FETCH_HEAD"]);
            if (!hard.ok) {
                return await sock.sendMessage(
                    jid,
                    { text: "❌ File sync failed (server permissions?). Try again later." },
                    { quoted: msg }
                );
            }

            // Always reinstall dependencies — the wrapper pin decides which
            // engine build is actually loaded.
            await sock.sendMessage(jid, { text: "📦 *Syncing dependencies... this can take a minute.*" }, { quoted: msg });
            const install = await runCmd(NPM_BIN, ["install", "--no-audit", "--no-fund", "--force"], { timeout: 600000 });
            if (!install.ok) {
                console.error("update npm install failed:", install.stderr.slice(0, 500));
                return await sock.sendMessage(
                    jid,
                    { text: "❌ Dependency install failed — bot files were updated, but a full restart/deploy is needed." },
                    { quoted: msg }
                );
            }

            await sock.sendMessage(jid, { text: "✅ *Update applied!* Restarting the bot in 3 seconds..." }, { quoted: msg });
            setTimeout(() => process.exit(1), 3000);
            return;
        }

        // ── No .git (Heroku / CypherX panels): re-deploy via latest tarball ──
        const UPSTREAM_TARBALL = "https://codeload.github.com/devwhitewizard/nexus-v1md/tar.gz/refs/heads/main";
        try {
            const tempTarPath = path.join(rootDir, "temp_update.tar.gz");
            const tempExtractDir = path.join(rootDir, "temp_update_extract");

            const response = await axios.get(UPSTREAM_TARBALL, { responseType: "arraybuffer", timeout: 45000 });
            fs.writeFileSync(tempTarPath, response.data);
            if (!fs.existsSync(tempExtractDir)) fs.mkdirSync(tempExtractDir, { recursive: true });

            const tarBin = process.platform === "win32" ? "tar.exe" : "tar";
            const extract = await runCmd(tarBin, ["-xzf", tempTarPath, "-C", tempExtractDir], { timeout: 120000 });
            if (!extract.ok) {
                if (fs.existsSync(tempTarPath)) fs.unlinkSync(tempTarPath);
                return await sock.sendMessage(jid, { text: "❌ Update extraction failed. Please update manually via your hosting panel." }, { quoted: msg });
            }

            const files = fs.readdirSync(tempExtractDir);
            const extractedFolder = files.length > 0 ? path.join(tempExtractDir, files[0]) : tempExtractDir;

            const protectedPaths = ["session", ".env", "database/storage.json", "database/nexus.db", "node_modules"];
            const copyRecursive = (src, dest) => {
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (const entry of entries) {
                    const srcPath = path.join(src, entry.name);
                    const destPath = path.join(dest, entry.name);
                    const relativePath = path.relative(rootDir, destPath).replace(/\\/g, "/");
                    if (protectedPaths.some(p => relativePath === p || relativePath.startsWith(p + "/"))) continue;
                    if (entry.isDirectory()) {
                        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
                        copyRecursive(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            };
            copyRecursive(extractedFolder, rootDir);

            if (fs.existsSync(tempTarPath)) fs.unlinkSync(tempTarPath);
            if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });

            await sock.sendMessage(jid, { text: "📦 *Core files updated — syncing dependencies...*" }, { quoted: msg });
            const install = await runCmd(NPM_BIN, ["install", "--no-audit", "--no-fund", "--force"], { timeout: 600000 });

            await sock.sendMessage(jid, { text: "✅ *Update successful!* Restarting the bot in 3 seconds..." }, { quoted: msg });
            setTimeout(() => process.exit(1), 3000);
        } catch (err) {
            console.error("tarball update failed:", err.message);
            await sock.sendMessage(jid, { text: "❌ Couldn't download the update archive. Please try again later." }, { quoted: msg });
        }
    }
};
