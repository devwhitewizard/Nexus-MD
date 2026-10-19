const { Buffer } = require("buffer");

module.exports = {
    name: "decode64",
    description: "Decode Base64 into UTF-8 text",
    category: "developer",
    usage: "<base64>",
    aliases: [],
    execute: async ({ sock, jid, msg, args, text }) => {
        const input = args.join(" ").trim();
        if (!input || input.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.decode64 aGVsbG8gd29ybGQ="
            });
        }

        try {
            const decoded = Buffer.from(input, "base64").toString("utf8");
            // Check if the decoded text looks valid (not garbage)
            if (!decoded || decoded.length === 0) {
                throw new Error("Invalid Base64 output");
            }
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 DECODE64 ]\n│ Input: \`${input}\`\n│\n│ decoded: ${decoded}\n└────────────────────`
            });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Decoding error\n\`${input}\` is not valid Base64.\n\`${error.message}\``
            });
        }
    }
};