const { clipText, inputTooLong, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "json",
    description: "Convert simple structured input into JSON or validate/pretty-print JSON",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.json name John age 20 city Nairobi\n\nOr for pretty-printing:\n.jsonformat {\"name\":\"John\",\"age\":20}"
            });
        }
        if (inputTooLong(input)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters).`
            });
        }

        // Check if input looks like key-value pairs
        const kvPattern = /^\w+(?:\s+\w+)*$/;
        if (kvPattern.test(input)) {
            const parts = input.split(/\s+/);
            const obj = {};
            for (let i = 0; i + 1 < parts.length; i += 2) {
                let value = parts[i + 1];
                if (/^-?\d+$/.test(value)) {
                    value = Number(value);
                }
                obj[parts[i]] = value;
            }
            await sock.sendMessage(jid, {
                text: clipText(`┌───[ 👨‍💻 JSON ]\n│ Input: \`${input.slice(0, 60)}\`\n│\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``)
            }, { quoted: msg });
            return;
        }

        // Try to parse as existing JSON (for .jsonformat behavior)
        try {
            const parsed = JSON.parse(input);
            await sock.sendMessage(jid, {
                text: clipText(`┌───[ 👨‍💻 JSON ]\n│ Valid JSON\n│\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``)
            }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(jid, {
                text: `❌ Invalid input\n\nUnable to convert "${input.slice(0, 60)}" to JSON.\n\nUsage:\n.json name John age 20 city Nairobi\n\nOr for pretty-printing:\n.jsonformat {"name":"John","age":20}`
            }, { quoted: msg });
        }
    }
};