const { clipText, inputTooLong, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "urlencode",
    description: "Encode text using URL encoding",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const raw = args.join(" ").trim();
        if (!raw) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.urlencode hello world"
            });
        }
        if (inputTooLong(raw)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters).`
            });
        }

        try {
            const input = raw.slice(0, MAX_INPUT_CHARS);
            const encoded = encodeURIComponent(input);
            await sock.sendMessage(jid, {
                text: clipText(`┌───[ 👨‍💻 URL ENCODE ]\n│ Input: \`${input}\`\n│\n│ Encoded:\n${encoded}\n└────────────────────`)
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Encoding error:\n\`${error.message}\``
            });
        }
    }
};