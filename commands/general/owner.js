const { ownerNumbers } = require("../../config");

module.exports = {
    name: "owner",
    aliases: ["creator", "master", "boss"],
    description: "Displays the Bot Owner's contact information.",
    category: "general",
    async execute({ sock, jid, msg }) {
        try {
            const rawOwner = (ownerNumbers && ownerNumbers[0])
                ? ownerNumbers[0].split("@")[0]
                : String(process.env.SUDO || process.env.PAIRING_NUMBER || "").replace(/\D/g, "");
            if (!rawOwner) {
                return await sock.sendMessage(jid, { text: "❌ Owner number is not configured (set OWNERS)." }, { quoted: msg });
            }
            const primaryOwner = rawOwner;
            const vcard = 'BEGIN:VCARD\n' // metadata of the contact card
                + 'VERSION:3.0\n' 
                + 'FN:WHITE WIZARD\n' // full name
                + 'ORG:Nexus-1MD Owner;\n' // the organization of the contact
                + `TEL;type=CELL;type=VOICE;waid=${primaryOwner}:+${primaryOwner}\n` // WhatsApp ID + phone number
                + 'END:VCARD';

            await sock.sendMessage(jid, {
                contacts: {
                    displayName: "WHITE WIZARD",
                    contacts: [{ vcard }]
                }
            }, { quoted: msg });

            await sock.sendMessage(jid, { 
                text: `👑 *NEXUS-1MD OWNER*\n\nMy master is *WHITE WIZARD*.\n\n📱 *Number:* +${primaryOwner}\n🌐 *WhatsApp:* https://wa.me/${primaryOwner}\n🌐 *GitHub:* github.com/devwhitewizard\n\n_Type .dev for more details._`
            }, { quoted: msg });

        } catch (err) {
            console.error("Owner card error:", err);
            await sock.sendMessage(jid, { text: "❌ Failed to send owner contact information." });
        }
    }
};
