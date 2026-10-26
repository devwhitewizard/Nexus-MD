const webtools = require("../../lib/webtools");

// Re-homed from commands/general/dnschecker.js (which was aliased `.dns`) —
// same behaviour, now canonical `.dns` in WEBTOOLS, extended with NS/AAAA.
module.exports = {
    name: "dns",
    aliases: ["dnschecker", "dnslookup"],
    description: "DNS lookup of a domain (A, AAAA, MX, NS, TXT).",
    category: "webtools",
    cooldown: 3000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.dns <domain>`\n\n*Example:*\n▸ `.dns google.com`" },
                { quoted: msg }
            );
        }

        let records;
        try {
            try { webtools.parseDomain(raw); }
            catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }
            await sock.sendMessage(jid, { text: `⏳ Looking up DNS records...` }, { quoted: msg });
            records = await webtools.dnsRecords(raw);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `❌ ${webtools.friendlyError(e)}` }, { quoted: msg });
        }

        const lines = [`🌐 *DNS LOOKUP*`, ``, `🗄 *Domain:* ${records.host}`];
        if (records.a.length) lines.push(`\n🅰️ *A (IPv4):*\n${records.a.map(i => `▸ ${i}`).join("\n")}`);
        if (records.aaaa.length) lines.push(`\n🆎 *AAAA (IPv6):*\n${records.aaaa.map(i => `▸ ${i}`).join("\n")}`);
        if (records.cname.length) lines.push(`\n📎 *CNAME:*\n${records.cname.map(i => `▸ ${i}`).join("\n")}`);
        if (records.mx.length) lines.push(`\n📧 *MX:*\n${records.mx.map(m => `▸ ${m.priority} ${m.exchange}`).join("\n")}`);
        if (records.ns.length) lines.push(`\n🧭 *NS:*\n${records.ns.map(i => `▸ ${i}`).join("\n")}`);
        if (records.txt.length) lines.push(`\n📝 *TXT:*\n${records.txt.map(t => `▸ ${t.slice(0, 120)}`).join("\n")}`);

        const out = lines.join("\n").length > 3400
            ? lines.join("\n").slice(0, 3400) + "\n\n… truncated (value too long for WhatsApp)"
            : lines.join("\n");
        await sock.sendMessage(jid, { text: out }, { quoted: msg });
    }
};
