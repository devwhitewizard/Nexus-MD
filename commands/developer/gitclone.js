const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// ── Security controls ────────────────────────────────────────────────────────
const CLONE_TIMEOUT_MS = 90 * 1000;      // hard git timeout
const MAX_CLONE_BYTES  = 200 * 1024 * 1024; // hard quota for the work dir
const CLONE_COOLDOWN_MS = 60 * 1000;     // per-user cooldown
const BLOCKED_HOSTS = new Set([
    "localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"
]);

// Global clone state (abuse prevention)
const gitcloneState = {
    inProgress: false,
    lastByUser: new Map()
};

// Resolves when a git process exits safely (args array, NEVER a shell string)
function runGit(args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", args, {
            shell: false,
            windowsHide: true,
            timeout: CLONE_TIMEOUT_MS,
            ...opts
        });
        let stderr = "";
        child.stderr && child.stderr.on("data", d => {
            if (stderr.length < 2000) stderr += d.toString();
        });
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("Git operation timed out."));
        }, CLONE_TIMEOUT_MS + 1000);
        child.on("error", (e) => { clearTimeout(timer); reject(e); });
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            if (signal) return reject(new Error("Git operation timed out."));
            if (code === 0) return resolve();
            const msg = (stderr || "").split("\n").filter(Boolean).pop();
            reject(new Error(msg || `git exited with code ${code}`));
        });
    });
}

// Keeps a URL to safe public HTTP/HTTPS git endpoints only
function validateRepoUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    } catch (_) {
        throw new Error("Invalid URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only http:// or https:// repository URLs are allowed.");
    }
    const host = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host) ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        host.endsWith(".local") ||
        host.endsWith(".internal")) {
        throw new Error("Private/local addresses are not allowed.");
    }
    if (url.port && !["80", "443", "443"].includes(url.port)) {
        throw new Error("Non-standard ports are not allowed.");
    }
    // Reject URLs with embedded credentials
    if (url.username || url.password) {
        throw new Error("Credentials in the URL are not allowed.");
    }
    return url.toString();
}

// Folder name: strict allow-list (no dots, slashes, traversal possible)
function sanitizeFolder(raw) {
    const cleaned = String(raw || "").trim();
    if (!cleaned) return null;
    if (cleaned.length > 64) throw new Error("Folder name too long (max 64).");
    if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
        throw new Error("Folder name may only contain letters, numbers, '-' and '_'.");
    }
    return cleaned;
}

module.exports = {
    name: "gitclone",
    description: "Clone a public Git repository into a secure sandbox (read/inspect only)",
    category: "developer",
    usage: "<repo_url> [folder]",
    aliases: [],
    execute: async ({ sock, jid, sender, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text:
                    "❌ Missing input\n\n" +
                    "Usage:\n.gitclone <repo_url> [folder]\n\n" +
                    "Example:\n" +
                    ".gitclone https://github.com/user/repo.git myproject"
            });
        }

        // ── Abuse prevention: one clone at a time, per-user cooldown ───────────
        if (gitcloneState.inProgress) {
            return await sock.sendMessage(jid, { text: "⏳ A clone is already in progress. Please wait." }, { quoted: msg });
        }
        const last = gitcloneState.lastByUser.get(sender);
        if (last && Date.now() - last < CLONE_COOLDOWN_MS) {
            const wait = Math.ceil((CLONE_COOLDOWN_MS - (Date.now() - last)) / 1000);
            return await sock.sendMessage(jid, { text: `⏳ Please wait ${wait}s before cloning again.` }, { quoted: msg });
        }

        const parts = input.split(/\s+/);
        const rawUrl = parts[0];
        let folderName = null;
        if (parts.length > 1) {
            try {
                folderName = sanitizeFolder(parts[1]);
            } catch (e) {
                return await sock.sendMessage(jid, { text: `❌ ${e.message}` }, { quoted: msg });
            }
        }

        let repoUrl;
        try {
            repoUrl = validateRepoUrl(rawUrl);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ Invalid repository URL\n${e.message}` }, { quoted: msg });
        }

        // Work dir: controlled temp location, unique per clone
        const session = crypto.randomBytes(8).toString("hex");
        const workRoot = path.join(os.tmpdir(), `nexus-gitclone-${session}`);
        const innerName = folderName ||
            path.basename(rawUrl.replace(/\/+$/, "")).replace(/\.git$/, "") ||
            "repository";
        const targetDir = path.join(workRoot, "repo");

        let repoRootName = innerName.replace(/\.git$/, "") || "repository";

        try {
            gitcloneState.inProgress = true;
            gitcloneState.lastByUser.set(sender, Date.now());

            await sock.sendMessage(jid, { react: { text: "📥", key: msg.key } });
            await sock.sendMessage(jid, { text: "⏳ Cloning repository (shallow)..." }, { quoted: msg });

            fs.mkdirSync(workRoot, { recursive: true });

            // spawn() with an args array — no shell, no injection surface
            await runGit([
                "clone", "--depth", "1", "--single-branch",
                repoUrl,
                targetDir
            ], { cwd: workRoot, windowsHide: true });

            // Bounded stats walk (count files, cap entries; hard quota check)
            let fileCount = 0;
            let totalBytes = 0;
            let tooBig = false;
            const stack = [targetDir];
            while (stack.length > 0) {
                const dir = stack.pop();
                let entries;
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
                for (const e of entries) {
                    const full = path.join(dir, e.name);
                    if (fileCount > 20000) { tooBig = true; break; }
                    let st;
                    try { st = fs.statSync(full); } catch (_) { continue; }
                    if (st.isDirectory() && e.name !== ".git") {
                        stack.push(full);
                    } else if (!st.isDirectory()) {
                        fileCount++;
                        totalBytes += st.size;
                        if (totalBytes > MAX_CLONE_BYTES) { tooBig = true; }
                    }
                }
                if (tooBig) break;
            }

            const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
            const result =
                "┌───[ 📦 GITCLONE ]\n" +
                `│ Repository: ${repoRootName}\n` +
                `│ Status: ✅ Clone succeeded\n` +
                (tooBig
                    ? "│ Note: Large repository — partial stats shown\n"
                    : `│ Files: ${fileCount}\n│ Size: ${sizeMB} MB\n`) +
                "│ Mode: sandboxed (source code only, never executed)\n" +
                "└────────────────────";

            await sock.sendMessage(jid, { text: result }, { quoted: msg });

        } catch (err) {
            const safeMsg = String(err && err.message ? err.message : "Unknown error").slice(0, 200);
            console.error("Gitclone error:", err && err.message);
            await sock.sendMessage(jid, {
                text: `❌ Clone failed\n${safeMsg}`
            }, { quoted: msg });
        } finally {
            // Always clean up the sandbox
            gitcloneState.inProgress = false;
            try {
                if (fs.existsSync(workRoot)) fs.rmSync(workRoot, { recursive: true, force: true });
            } catch (_) {}
        }
    }
};