const webtools = require("../../lib/webtools");

// Dual-purpose (single canonical .status):
//  • `.status`                    → bot system health (previous behavior, unchanged)
//  • `.status https://example.com` → HTTP status check
module.exports = {
    name: "status",
    aliases: ["systemstatus", "health", "sysinfo", "!status", "system", "systeminfo"],
    description: "Website status check, or bot health when used without a URL.",
    category: "webtools",
    cooldown: 3000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();

        // ── Mode 1: website check
        if (/^(https?:\/\/|[\w-]+(\.[\w-]+)+)/i.test(raw)) {
            try {
                await sock.sendMessage(jid, { text: "⏳ Checking website..." }, { quoted: msg });
            } catch (e) { /* keep going */ }

            let result;
            try {
                result = await webtools.checkHttpStatus(raw);
            } catch (e) {
                return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg });
            }

            const statusIcon = result.status < 300 ? "🟢" : result.status < 400 ? "🟡" : "🔴";
            const statusText =
                `🌐 *HTTP STATUS*\n\n` +
                `🔗 *URL:* ${raw.slice(0, 200)}\n` +
                `${statusIcon} *Status:* ${result.status}\n` +
                `⏱ *Response Time:* ${result.timeMs}ms\n` +
                (result.hops ? `↪️ *Redirects:* ${result.hops}\n` : "") +
                (result.finalUrl && result.finalUrl !== raw &&
                    !/^https?:\/\/[^/]*$/i.test(raw) ? `🎯 *Final:* ${result.finalUrl.slice(0, 180)}\n` : "");
            return await sock.sendMessage(jid, { text: statusText }, { quoted: msg });
        }

        // ── Mode 2: bot health (unchanged original)
        const os = require("os");
        const uptimeSeconds = process.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);
        const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);
        const procMem = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

        const statusText =
            `🛰️ *NEXUS SYSTEM STATUS*\n\n` +
            `🟢 *Status:* Healthy\n` +
            `🕒 *Uptime:* \`${uptimeStr}\`\n\n` +
            `💻 *OS:* ${os.platform()} ${os.release()}\n` +
            `🧠 *Server RAM:* \`${usedMem}GB / ${totalMem}GB\`\n` +
            `📟 *Process RAM:* \`${procMem}MB\`\n` +
            `🤖 *NodeJS:* ${process.version}\n\n` +
            `_Nexus-1MD Core Engine_`;

        await sock.sendMessage(jid, { text: statusText }, { quoted: msg });
    }
};
