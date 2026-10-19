module.exports = {
    name: "uuid",
    description: "Generate a random UUID",
    category: "developer",
    usage: "",
    aliases: [],
    execute: async ({ sock, jid, msg }) => {
        try {
            // Check if Node.js version supports crypto.randomUUID()
            let uuid;
            try {
                uuid = crypto.randomUUID();
            } catch (e) {
                // Fallback for older Node.js versions
                const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
                uuid = s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
            }

            const expl = "┌───[ 🆔 UUID ]\n" +
                "│ " + uuid + "\n" +
                "└────────────────────";

            await sock.sendMessage(jid, { text: expl });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: "❌ Error generating UUID:\n```" + error.message + "```"
            });
        }
    }
};