const { askAI, checkAILimit } = require("../../lib/aiHelper");

module.exports = {
    name: "debug",
    description: "Analyze code or errors and suggest a fix",
    category: "developer",
    usage: "<code/error>",
    aliases: [],
    execute: async ({ sock, jid, sender, msg, args, text }) => {
        let input = args.join(" \n").trim();
        if (!input) input = (text || "").trim();

        if (!input) {
            return await sock.sendMessage(jid, {
                text:
                    "❌ Missing input\n\n" +
                    "Usage:\n.debug <code/error>\n\n" +
                    "Examples:\n" +
                    "• .debug TypeError: Cannot read properties of undefined\n" +
                    "• .debug (reply to a code message)"
            });
        }

        // Reasonable input limit
        if (input.length > 2000) {
            return await sock.sendMessage(jid, { text: "❌ Input too long (max 2000 characters)." });
        }

        const system =
            "You are a senior software debugging assistant. " +
            "Analyze the given code or error and reply in exactly this structure:\n" +
            "1. Problem: (one short line)\n" +
            "2. Why it happens: (1-2 lines)\n" +
            "3. Fixed code: (inside a code block with language name)\n" +
            "4. Short explanation: (1-2 lines)\n" +
            "Do not pretend to run the code. Never invent APIs or package names.";

        try {
            // 🛡️ Rate Limit Check
            const limit = checkAILimit(sender);
            if (!limit.allowed) {
                return await sock.sendMessage(jid, { text: limit.reason }, { quoted: msg });
            }

            await sock.sendMessage(jid, { react: { text: "🐛", key: msg.key } });

            const userPrompt = `Help me debug this code or error message:\n\n${input}`;
            const result = await askAI(userPrompt, system);

            const header = `┌───[ 🐛 DEBUG ]\n└────────────────────\n\n`;
            await sock.sendMessage(jid, {
                text: header + result
            }, { quoted: msg });

        } catch (err) {
            console.error("Debug error:", err);
            await sock.sendMessage(jid, { text: "⚠️ Debug analysis failed. Please try again later." }, { quoted: msg });
        }
    }
};