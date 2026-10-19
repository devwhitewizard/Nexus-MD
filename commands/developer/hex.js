const Buffer = require("buffer").Buffer;
const { clipText, inputTooLong, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "hex",
    description: "Convert UTF-8 text into hexadecimal",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const raw = args.join(" ").trim();
        if (!raw) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.hex hello"
            });
        }
        if (inputTooLong(raw)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters).`
            });
        }

        try {
            const input = raw.slice(0, MAX_INPUT_CHARS);
            const hex = Buffer.from(input, "utf8").toString("hex");
            await sock.sendMessage(jid, {
                text: clipText(`┌───[ 👨‍💻 HEX ]\n│ Input: \`${input}\`\n│\n│ Hex:\n${hex}\n└────────────────────`)
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Conversion error:\n\`${error.message}\``
            });
        }
    }
};