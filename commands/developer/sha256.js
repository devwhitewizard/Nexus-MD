const { createHash } = require("crypto");

module.exports = {
    name: "sha256",
    description: "Generate SHA-256 hash",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const text = args.join(" ").trim();
        if (!text || text.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.sha256 hello world"
            });
        }

        try {
            const hash = createHash("sha256").update(text).digest("hex");
            const expl = "┌───[ 🔐 SHA256 ]\n" +
                "│ Input: ```" + text + "```\n" +
                "│ Algorithm: SHA-256\n" +
                "│ Result: " + hash + "\n" +
                "└────────────────────";
            await sock.sendMessage(jid, { text: expl });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: "❌ Hashing error:\n```" + error.message + "```"
            });
        }
    }
};