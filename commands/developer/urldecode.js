module.exports = {
    name: "urldecode",
    description: "Decode URL-encoded text",
    category: "developer",
    usage: "<encoded>",
    aliases: [],
    execute: async ({ sock, jid, msg, args, text }) => {
        const input = args.join(" ").trim();
        if (!input || input.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.urldecode hello%20world"
            });
        }

        try {
            const decoded = decodeURIComponent(input);
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 URL DECODE ]\n│ Input: \`${input}\`\n│\n│ decoded: ${decoded}\n└────────────────────`
            });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Decoding error\n\`${input}\` is not valid URL-encoded text.\n\`${error.message}\``
            });
        }
    }
};