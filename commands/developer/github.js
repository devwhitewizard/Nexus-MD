const axios = require("axios");

// Small TTL cache (10 min) to respect rate limits
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

// Optional: use GITHUB_TOKEN from env if configured (raises rate limit)
function githubHeaders() {
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "Nexus-1MD"
    };
    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
}

module.exports = {
    name: "github",
    description: "Retrieve public GitHub repository information",
    category: "developer",
    usage: "<user/repo>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text:
                    "❌ Missing input\n\n" +
                    "Usage:\n.github <user/repo>\n\n" +
                    "Examples:\n" +
                    "• .github facebook/react\n" +
                    "• .github devwhitewizard/nexus-v1md"
            });
        }

        // Validate "user/repo" format (no URLs, no path traversal)
        if (input.length > 120 || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input)) {
            return await sock.sendMessage(jid, {
                text: "❌ Invalid format\n\nUse: .github <user/repo>\nExample: .github facebook/react"
            });
        }

        const slash = input.indexOf("/");
        const owner = input.slice(0, slash);
        const repo = input.slice(slash + 1);

        // Small TTL cache to respect rate limits
        const cached = cache.get(input.toLowerCase());
        if (cached && Date.now() - cached.at < CACHE_TTL) {
            return await sock.sendMessage(jid, { text: cached.text }, { quoted: msg });
        }

        try {
            await sock.sendMessage(jid, { react: { text: "🐙", key: msg.key } });

            const { data: repoInfo } = await axios.get(
                `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
                { headers: githubHeaders(), timeout: 15000, maxContentLength: 512 * 1024 }
            );

            const licenseName = repoInfo.license && repoInfo.license.name
                ? repoInfo.license.name
                : "None";

            const lines = [
                "┌───[ 🐙 GITHUB ]",
                `│ Repository: ${repoInfo.full_name || `${owner}/${repo}`}`,
                `│ Description: ${(repoInfo.description || "—").slice(0, 120)}`,
                `│ Stars: ⭐ ${repoInfo.stargazers_count ?? "?"}`,
                `│ Forks: 🍴 ${repoInfo.forks_count ?? "?"}`,
                `│ Open issues: 🐛 ${repoInfo.open_issues_count ?? "?"}`,
                `│ Default branch: ${repoInfo.default_branch || "—"}`,
                `│ Language: ${repoInfo.language || "—"}`,
                `│ License: ${licenseName}`,
                `│ URL: ${repoInfo.html_url ? repoInfo.html_url.slice(0, 120) : "—"}`,
                "└────────────────────"
            ];

            const text = lines.join("\n");
            if (cache.size > 50) cache.clear();
            cache.set(input.toLowerCase(), { at: Date.now(), text });
            await sock.sendMessage(jid, { text }, { quoted: msg });

        } catch (err) {
            if (err.response && err.response.status === 404) {
                return await sock.sendMessage(jid, { text: "❌ Repository not found (or it is private)." }, { quoted: msg });
            }
            if (err.response && err.response.status === 403) {
                return await sock.sendMessage(jid, { text: "⛔ GitHub API rate limit reached. Please try again later." }, { quoted: msg });
            }
            console.error("GitHub info error:", err.message);
            await sock.sendMessage(jid, { text: "⚠️ Could not reach the GitHub API. Please try again later." }, { quoted: msg });
        }
    }
};