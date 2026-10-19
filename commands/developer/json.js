module.exports = {
    name: "json",
    description: "Convert simple structured input into JSON or validate/pretty-print JSON",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args, text }) => {
        const input = args.join(" ").trim();
        if (!input || input.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.json name John age 20 city Nairobi\n\nOr for pretty-printing:\n.jsonformat {\"name\":\"John\",\"age\":20}"
            });
        }

        // Check if input looks like key-value pairs
        const kvPattern = /^\w+(?:\s+\w+)*$/;
        if (kvPattern.test(input)) {
            const parts = input.split(/\s+/);
            const obj = {};
            for (let i = 0; i + 1 < parts.length; i += 2) {
                // Convert value to number when possible
                let value = parts[i + 1];
                if (/^-?\d+$/.test(value)) {
                    value = Number(value);
                }
                obj[parts[i]] = value;
            }
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 JSON ]\n│ Input: \`${input.slice(0, 60)}\`\n│\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``
            });
            return;
        }

        // Try to parse as existing JSON (for .jsonformat behavior)
        try {
            const parsed = JSON.parse(input);
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 JSON ]\n│ Valid JSON\n│\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``
            });
        } catch (e) {
            // Not valid JSON and not key-value pairs
            await sock.sendMessage(jid, {
                text: `❌ Invalid input\n\nUnable to convert "\${input}" to JSON.\n\nUsage:\n.json name John age 20 city Nairobi\n\nOr for pretty-printing:\n.jsonformat {\"name\":\"John\",\"age\":20}`
            });
        }
    }
};