const { Buffer } = require("buffer");

module.exports = {
    name: "hex",
    description: "Convert UTF-8 text into hexadecimal",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const text = args.join(" ").trim();
        if (!text || text.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.hex hello"
            });
        }

        try {
            const hex = Buffer.from(text, "utf8").toString("hex");
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 HEX ]\n│ Input: \`${text}\`\n│\n│ Hex: ${hex}\n└────────────────────`
            });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: "❌ Conversion error:\n```" + error.message + "```"
            });
        }
    }
};