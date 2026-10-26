const webtools = require("../../lib/webtools");

// WHOIS via RDAP (rdap.org) — structured fields only, never a raw dump.
module.exports = {
    name: "whois",
    description: "WHOIS registration lookup of a domain.",
    category: "webtools",
    cooldown: 5000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.whois <domain>`\n\n*Example:*\n▸ `.whois example.com`" },
                { quoted: msg }
            );
        }

        let whois;
        try { webtools.parseDomain(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

        try {
            await sock.sendMessage(jid, { text: "🔎 Looking up WHOIS records..." }, { quoted: msg });
            whois = await webtools.whoisLookup(raw);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg });
        }

        const lines = [
            `🔎 *WHOIS*`,
            ``,
            `🗄 *Domain:* ${whois.domain}`,
            whois.registrar ? `🏢 *Registrar:* ${whois.registrar}` : "",
            whois.created ? `📅 *Created:* ${whois.created}` : "",
            whois.updated ? `🔄 *Updated:* ${whois.updated}` : "",
            whois.expires ? `⌛ *Expires:* ${whois.expires}` : "",
            whois.status.length ? `🏷 *Status:* ${whois.status.map(s => String(s).slice(0, 40)).join(", ")}` : ""
        ].filter(Boolean);

        if (whois.nameservers.length) {
            lines.push(`🧭 *Nameservers:*`);
            for (const ns of whois.nameservers) lines.push(`▸ ${ns}`);
        }

        await sock.sendMessage(
            jid,
            { text: lines.join("\n").slice(0, 3400) },
            { quoted: msg }
        );
    }
};
