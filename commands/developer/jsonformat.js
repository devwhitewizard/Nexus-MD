const { clipText, inputTooLong, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "jsonformat",
    description: "Validate and pretty-print JSON",
    category: "developer",
    usage: "<json>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.jsonformat {\"name\":\"John\",\"age\":20}"
            });
        }
        if (inputTooLong(input)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters).\n\n_Tip: for very large JSON, validate it locally first._`
            });
        }

        try {
            const parsed = JSON.parse(input);
            const pretty = clipText(JSON.stringify(parsed, null, 2));
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 JSONFORMAT ]\n│ Valid JSON\n│\n\`\`\`json\n${pretty}\n\`\`\``
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Invalid JSON\nError: ${error.message}`
            }, { quoted: msg });
        }
    }
};