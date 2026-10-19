const Buffer = require("buffer").Buffer;
const { clipText, inputTooLong, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "decode64",
    description: "Decode Base64 into UTF-8 text",
    category: "developer",
    usage: "<base64>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.decode64 aGVsbG8gd29ybGQ="
            });
        }
        if (inputTooLong(input)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters).`
            });
        }

        try {
            const decoded = Buffer.from(input, "base64").toString("utf8");
            // Check if the decoded text looks valid (not garbage)
            if (!decoded || decoded.length === 0) {
                throw new Error("Invalid Base64 output");
            }
            await sock.sendMessage(jid, {
                text: clipText(`┌───[ 👨‍💻 DECODE64 ]\n│ Input: \`${input}\`\n│\n│ Decoded:\n${decoded}\n└────────────────────`)
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Decoding error\n\`${input.slice(0, 80)}\` is not valid Base64.\n\`${error.message}\``
            });
        }
    }
};