module.exports = {
    name: "jsonformat",
    description: "Validate and pretty-print JSON",
    category: "developer",
    usage: "<json>",
    aliases: [],
    execute: async ({ sock, jid, msg, args, text }) => {
        const jsonInput = args.join(" ").trim();
        if (!jsonInput || jsonInput.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.jsonformat {\"name\":\"John\",\"age\":20}"
            });
        }

        try {
            const parsed = JSON.parse(jsonInput);
            const pretty = JSON.stringify(parsed, null, 2);
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 JSONFORMAT ]\n│ Valid JSON\n│\n\`\`\`json\n${pretty}\n\`\`\``
            });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: `❌ Invalid JSON\nError: ${error.message}`
            });
        }
    }
};