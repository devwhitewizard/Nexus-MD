const axios = require("axios");

// Small TTL cache (10 min) to respect the registry
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

module.exports = {
    name: "npm",
    description: "Retrieve public NPM package information",
    category: "developer",
    usage: "<package>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text:
                    "❌ Missing input\n\n" +
                    "Usage:\n.npm <package>\n\n" +
                    "Examples:\n" +
                    "• .npm express\n" +
                    "• .npm @whiskeysockets/baileys"
            });
        }

        // Validate package name (scoped packages allowed)
        if (input.length > 214 || !/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(input)) {
            return await sock.sendMessage(jid, { text: "❌ Invalid package name." });
        }

        // Small TTL cache to respect the registry
        const cacheKey = input.toLowerCase();
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.at < CACHE_TTL) {
            return await sock.sendMessage(jid, { text: cached.text }, { quoted: msg });
        }

        try {
            await sock.sendMessage(jid, { react: { text: "📦", key: msg.key } });

            const { data: pkg } = await axios.get(
                `https://registry.npmjs.org/${encodeURIComponent(input)}`,
                { timeout: 15000, maxContentLength: 2 * 1024 * 1024 }
            );

            // Package not found
            if (!pkg || pkg.error || !pkg["dist-tags"] || !pkg["dist-tags"].latest) {
                return await sock.sendMessage(jid, { text: "❌ Package not found on the npm registry." }, { quoted: msg });
            }

            const latestVersion = pkg["dist-tags"].latest;
            const latest = (pkg.versions && pkg.versions[latestVersion]) || {};
            const repo = typeof pkg.repository === "object" ? pkg.repository.url : pkg.repository;

            // Weekly downloads (may fail; non-blocking)
            let downloads = null;
            try {
                const dlRes = await axios.get(
                    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(input)}`,
                    { timeout: 8000, maxContentLength: 64 * 1024 }
                );
                downloads = dlRes.data && dlRes.data.downloads;
            } catch (_) {}

            const homepage = latest.homepage || pkg.homepage;
            const lines = [
                "┌───[ 📦 NPM ]",
                `│ Name: ${pkg.name}`,
                `│ Version: ${latestVersion}`,
                `│ Description: ${(pkg.description || "—").slice(0, 120)}`,
                `│ License: ${latest.license || pkg.license || "—"}`
            ];
            if (downloads !== null) lines.push(`│ Weekly downloads: ${downloads}`);
            if (repo) lines.push(`│ Repository: ${String(repo).replace(/^git\+/, "").slice(0, 100)}`);
            if (homepage) lines.push(`│ Homepage: ${String(homepage).slice(0, 100)}`);
            if (pkg.time && pkg.time[latestVersion]) {
                lines.push(`│ Published: ${String(pkg.time[latestVersion]).slice(0, 10)}`);
            }
            lines.push("└────────────────────");

            const text = lines.join("\n");
            if (cache.size > 50) cache.clear();
            cache.set(cacheKey, { at: Date.now(), text });
            await sock.sendMessage(jid, { text }, { quoted: msg });

        } catch (err) {
            if (err.response && err.response.status === 404) {
                return await sock.sendMessage(jid, { text: "❌ Package not found on the npm registry." }, { quoted: msg });
            }
            console.error("NPM info error:", err.message);
            await sock.sendMessage(jid, { text: "⚠️ Could not reach the npm registry. Please try again later." }, { quoted: msg });
        }
    }
};