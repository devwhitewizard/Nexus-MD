module.exports = {
    name: "urlencode",
    description: "Encode text using URL encoding",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args, text }) => {
        const input = args.join(" ").trim();
        if (!input || input.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.urlencode hello world"
            });
        }

        try {
            const encoded = encodeURIComponent(input);
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 URL ENCODE ]\n│ Input: \`${input}\`\n│\n│ encoded: ${encoded}\n└────────────────────`
            });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Encoding error:\n\`${error.message}\``
            });
        }
    }
};