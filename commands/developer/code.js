const { askCode, checkAILimit } = require("../../lib/aiHelper");

module.exports = {
    name: "code",
    description: "Generate code from a programming request using AI",
    category: "developer",
    usage: "<prompt>",
    aliases: [],
    execute: async ({ sock, jid, sender, msg, args }) => {
        const prompt = args.join(" ").trim();
        if (!prompt) {
            return await sock.sendMessage(jid, {
                text:
                    "❌ Missing input\n\n" +
                    "Usage:\n.code <prompt>\n\n" +
                    "Examples:\n" +
                    "• .code a JavaScript function that checks if a number is prime\n" +
                    "• .code a Python script to rename all files in a folder"
            });
        }

        // Reasonable input limit
        if (prompt.length > 1000) {
            return await sock.sendMessage(jid, { text: "❌ Input too long (max 1000 characters)." });
        }

        try {
            // 🛡️ Rate Limit Check
            const limit = checkAILimit(sender);
            if (!limit.allowed) {
                return await sock.sendMessage(jid, { text: limit.reason }, { quoted: msg });
            }

            await sock.sendMessage(jid, { react: { text: "👨‍💻", key: msg.key } });

            const result = await askCode(prompt);

            const header = `┌───[ 👨‍💻 CODE ]\n│ Language: auto\n└────────────────────\n\n`;
            await sock.sendMessage(jid, {
                text: header + result
            }, { quoted: msg });

        } catch (err) {
            console.error("Developer code error:", err);
            await sock.sendMessage(jid, { text: "⚠️ Code generation failed. Please try again later." }, { quoted: msg });
        }
    }
};