const { Buffer } = require("buffer");

module.exports = {
    name: "base64",
    description: "Encode UTF-8 text into Base64",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args, text }) => {
        const input = args.join(" ").trim();
        if (!input || input.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.base64 hello world"
            });
        }

        try {
            const encoded = Buffer.from(input, "utf8").toString("base64");
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 BASE64 ]\n│ Input: \`${input}\`\n│\n│ encoded: ${encoded}\n└────────────────────`
            });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Encoding error:\n\`${error.message}\``
            });
        }
    }
};