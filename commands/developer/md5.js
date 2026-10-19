const { createHash } = require("crypto");

module.exports = {
    name: "md5",
    description: "Generate an MD5 digest",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const text = args.join(" ").trim();
        if (!text || text.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.md5 hello world"
            });
        }

        try {
            // Note: MD5 is NOT suitable for password security
            const hash = createHash("md5").update(text).digest("hex");
            const expl = "┌───[ 🔐 MD5 ]\n" +
                "│ ⚠️ MD5 is NOT suitable for password security\n" +
                "│ Input: ```" + text + "```\n" +
                "│ Algorithm: MD5\n" +
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