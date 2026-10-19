const { createHash } = require("crypto");

module.exports = {
    name: "hash",
    description: "Generate a cryptographic hash (defaults to SHA-256)",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const text = args.join(" ").trim();
        if (!text || text.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.hash hello world"
            });
        }

        try {
            const hash = createHash("sha256").update(text).digest("hex");
            const expl = "┌───[ 🔐 HASH ]\n" +
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