const webtools = require("../../lib/webtools");

module.exports = {
    name: "ip",
    description: "Inspect an IP address (type, public/private, basic geo).",
    category: "webtools",
    cooldown: 3000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.ip <address>`\n\n*Examples:*\n▸ `.ip 8.8.8.8`\n▸ `.ip 2606:4700::1111`" },
                { quoted: msg }
            );
        }

        let info;
        try { info = await webtools.ipInfo(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg }); }

        let text;
        if (info.private) {
            text =
                `🌐 *IP INFORMATION*\n\n` +
                `⚠️ *IP:* ${info.ip}\n` +
                `🏷 *Type:* IPv${info.version}\n` +
                `🔒 *Scope:* PRIVATE / LOCAL\n\n` +
                `_Private addresses have no public geolocation._`;
        } else {
            text =
                `🌐 *IP INFORMATION*\n\n` +
                `⚠️ *IP:* ${info.ip}\n` +
                `🏷 *Type:* IPv${info.version}\n` +
                `🌍 *Country:* ${info.country || "—"}${info.countryCode ? ` (${info.countryCode})` : ""}\n` +
                `🏢 *ISP:* ${info.isp || "—"}\n` +
                (info.org ? `🧩 *Org:* ${info.org}\n` : "") +
                `🆓 *Scope:* Public`;
        }
        await sock.sendMessage(jid, { text }, { quoted: msg });
    }
};
