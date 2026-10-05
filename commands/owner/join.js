module.exports = {
    name: "join",
    aliases: ["joingroup", "acceptinvite"],
    description: "Make the bot join a WhatsApp group via invite link",
    category: "owner",
    isOwnerOnly: true,
    execute: async (ctx) => {
        const { sock, jid, args, msg } = ctx;
        const link = args[0];

        if (!link) {
            return await sock.sendMessage(jid, { 
                text: "⚠️ *Usage:* `.join <group_invite_link>`\n\n*Example:* `.join https://chat.whatsapp.com/IVnWNxWwfT1JdG4QoZOmeL`" 
            }, { quoted: msg });
        }

        const code = link.replace(/.*chat\.whatsapp\.com\//, "").trim();
        if (!code) {
            return await sock.sendMessage(jid, { text: "❌ Invalid WhatsApp group invite link." }, { quoted: msg });
        }

        try {
            const joinedJid = await sock.groupAcceptInvite(code);
            await sock.sendMessage(jid, { text: `✅ *Successfully Joined Group!* (${joinedJid || code})` }, { quoted: msg });
        } catch (err) {
            console.error("Join group error:", err);
            await sock.sendMessage(jid, { text: `❌ *Failed to join group:* ${err.message || "Invalid or expired link."}` }, { quoted: msg });
        }
    }
};
