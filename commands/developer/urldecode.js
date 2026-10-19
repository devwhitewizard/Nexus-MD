const { clipText, inputTooLong, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "urldecode",
    description: "Decode URL-encoded text",
    category: "developer",
    usage: "<encoded>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.urldecode hello%20world"
            });
        }
        if (inputTooLong(input)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters).`
            });
        }

        try {
            const decoded = decodeURIComponent(input);
            await sock.sendMessage(jid, {
                text: clipText(`┌───[ 👨‍💻 URL DECODE ]\n│ Input: \`${input}\`\n│\n│ Decoded:\n${decoded}\n└────────────────────`)
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Decoding error\n\`${input.slice(0, 80)}\` is not valid URL-encoded text.\n\`${error.message}\``
            });
        }
    }
};