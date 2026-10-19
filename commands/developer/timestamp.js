module.exports = {
    name: "timestamp",
    description: "Return the current Unix timestamp",
    category: "developer",
    usage: "",
    aliases: [],
    execute: async ({ sock, jid, msg }) => {
        try {
            const now = new Date();
            const unixSeconds = Math.floor(now.getTime() / 1000);
            const unixMilliseconds = now.getTime();
            const utcTime = now.toISOString();

            const expl = "┌───[ ⏱️ TIMESTAMP ]\n" +
                "│ Unix: " + unixSeconds + "\n" +
                "│ Milliseconds: " + unixMilliseconds + "\n" +
                "│ UTC: " + utcTime + "\n" +
                "└────────────────────";
            await sock.sendMessage(jid, { text: expl });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: "❌ Error getting timestamp:\n```" + error.message + "```"
            });
        }
    }
};