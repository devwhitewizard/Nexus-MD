const Buffer = require("buffer").Buffer;
const { clipInput, inputTooLong, clipText, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "base64",
    description: "Encode UTF-8 text into Base64",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const raw = args.join(" ").trim();
        if (!raw) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.base64 hello world"
            });
        }
        if (inputTooLong(raw)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters for encoding).`
            });
        }

        try {
            const input = clipInput(raw);
            const encoded = Buffer.from(input, "utf8").toString("base64");
            await sock.sendMessage(jid, {
                text: clipText(`┌───[ 👨‍💻 BASE64 ]\n│ Input: \`${input}\`\n│\n│ Encoded:\n${encoded}\n└────────────────────`)
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Encoding error:\n\`${error.message}\``
            });
        }
    }
};