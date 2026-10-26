const webtools = require("../../lib/webtools");

// Combines DNS + RDAP services — no duplicate API clients.
module.exports = {
    name: "domain",
    description: "Domain information (TLD, IPs, nameservers, registrar).",
    category: "webtools",
    cooldown: 4000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.domain <domain>`\n\n*Example:*\n▸ `.domain example.com`" },
                { quoted: msg }
            );
        }

        let d;
        try { d = webtools.parseDomain(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

        await sock.sendMessage(jid, { text: `⏳ Gathering domain info...` }, { quoted: msg });

        // DNS is essential; RDAP is a bonus (probe optional)
        let records = null;
        try { records = await webtools.dnsRecords(d); }
        catch (e) { /* a parked domain may not resolve — still show what we can */ }

        let whois = null;
        try { whois = await webtools.whoisLookup(d); }
        catch (e) { /* optional */ }

        if (!records && !whois) {
            return await sock.sendMessage(jid, { text: `❌ No DNS or registration records found for \`${d}\`.` }, { quoted: msg });
        }

        const tld = d.split(".").pop().toLowerCase();
        const lines = [
            `🌐 *DOMAIN INFO*\n`,
            `🗄 *Domain:* ${d}`,
            `🏷 *TLD:* .${tld}`
        ];
        if (records) {
            if (records.a.length) lines.push(`🅰️ *Resolved IPs:* ${records.a.slice(0, 3).join(", ")}`);
            else if (records.aaaa.length) lines.push(`🆎 *Resolved IPs:* ${records.aaaa.slice(0, 2).join(", ")}`);
            if (records.ns.length) lines.push(`🧭 *Nameservers:* ${records.ns.slice(0, 4).join(", ")}`);
        }
        if (whois) {
            if (whois.registrar) lines.push(`🏢 *Registrar:* ${whois.registrar}`);
            if (whois.created) lines.push(`📅 *Created:* ${whois.created}`);
            if (whois.expires) lines.push(`⌛ *Expires:* ${whois.expires}`);
        }
        lines.push(`\n_Detailed lookups: \`.dns ${d}\` • \`.whois ${d}\`_`);

        await sock.sendMessage(jid, { text: lines.join("\n") }, { quoted: msg });
    }
};
