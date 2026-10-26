const webtools = require("../../lib/webtools");

module.exports = {
    name: "ipinfo",
    description: "Detailed IP information (geo, ISP, ASN, timezone).",
    category: "webtools",
    cooldown: 4000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.ipinfo <address>`\n\n*Example:*\n▸ `.ipinfo 8.8.8.8`" },
                { quoted: msg }
            );
        }

        let info;
        try { info = await webtools.ipInfo(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg }); }

        if (info.private) {
            return await sock.sendMessage(
                jid,
                { text: `🔒 \`${info.ip}\` is a private/local address — no public details exist for it.` },
                { quoted: msg }
            );
        }

        const text =
            `🌐 *IPINFO*\n\n` +
            `⚠️ *IP:* ${info.ip} (IPv${info.version})\n` +
            `🌍 *Country:* ${info.country || "—"}${info.countryCode ? ` (${info.countryCode})` : ""}\n` +
            `🗺 *Region:* ${info.region || "—"}\n` +
            `🏙 *City:* ${info.city || "—"}\n` +
            `🕒 *Timezone:* ${info.timezone || "—"}\n` +
            `🏢 *ISP:* ${info.isp || "—"}\n` +
            (info.org ? `🧩 *Organization:* ${info.org}\n` : "") +
            (info.asn ? `🔢 *ASN:* ${info.asn}\n` : "") +
            (Number.isFinite(info.lat) && Number.isFinite(info.lon)
                ? `📍 *Coordinates:* ${info.lat.toFixed(3)}, ${info.lon.toFixed(3)}`
                : "");

        await sock.sendMessage(jid, { text }, { quoted: msg });
    }
};
