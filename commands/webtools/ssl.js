const webtools = require("../../lib/webtools");

// TLS certificate inspection via Node's tls module — certificate validation
// is NEVER disabled, so invalid/expired/mismatched certs fail clearly.
module.exports = {
    name: "ssl",
    description: "Inspect the SSL/TLS certificate of a domain.",
    category: "webtools",
    cooldown: 4000,
    async execute({ sock, jid, msg, args }) {
        const raw = (args[0] || "").trim();
        if (!raw) {
            return await sock.sendMessage(
                jid,
                { text: "❓ *Usage:* `.ssl <domain>`\n\n*Example:*\n▸ `.ssl google.com`" },
                { quoted: msg }
            );
        }

        let host;
        try { host = webtools.parseDomain(raw); }
        catch (e) { return await sock.sendMessage(jid, { text: webtools.friendlyError(e) }, { quoted: msg }); }

        try { await sock.sendMessage(jid, { text: "🔐 Connecting securely..." }, { quoted: msg }); } catch (e) { /* keep */ }

        let info;
        try {
            info = await webtools.tlsInspect(host);
        } catch (e) {
            return await sock.sendMessage(jid, { text: `TLS check failed: ${webtools.friendlyError(e)}` }, { quoted: msg });
        }

        const cert = info.cert || {};
        const issuerCN = (typeof (cert.issuer || {}) === "object" && (cert.issuer.O || cert.issuer.CN || "—")) || "—";
        const subjectCN = cert.subject && (cert.subject.CN || cert.subject.O) || "—";

        const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const daysLeft = validTo ? Math.ceil((validTo - Date.now()) / 86400000) : null;

        const lines = [
            `🔐 *SSL/TLS*`,
            ``,
            `🗄 *Domain:* ${host}`,
            `✅ *Valid:* Yes`,
            `🏛 *Issuer:* ${issuerCN}`,
            `📄 *Subject:* ${subjectCN}`,
            validFrom ? `🔓 *Valid From:* ${validFrom.toISOString().slice(0, 10)}` : "",
            validTo ? `🔒 *Valid Until:* ${validTo.toISOString().slice(0, 10)}` : "",
            daysLeft !== null ? `📆 *Days Remaining:* ${daysLeft}` : "",
            info.protocol ? `🧱 *Protocol:* ${info.protocol}` : ""
        ].filter(Boolean);

        await sock.sendMessage(jid, { text: lines.join("\n") }, { quoted: msg });
    }
};
