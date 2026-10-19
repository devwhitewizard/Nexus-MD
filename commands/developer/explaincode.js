const { askAI, checkAILimit } = require("../../lib/aiHelper");
const { clipText } = require("../../lib/devSafety");

module.exports = {
    name: "explaincode",
    description: "Explain source code for learners and developers",
    category: "developer",
    usage: "<code>",
    aliases: [],
    execute: async ({ sock, jid, sender, msg, args, text }) => {
        let input = args.join(" \n").trim();
        if (!input) input = (text || "").trim();

        if (!input) {
            return await sock.sendMessage(jid, {
                text:
                    "❌ Missing input\n\n" +
                    "Usage:\n.explaincode <code>\n\n" +
                    "Examples:\n" +
                    "• .explaincode const users = data.filter(user => user.active)\n" +
                    "• .explaincode (reply to a code message)"
            });
        }

        // Reasonable input limit
        if (input.length > 2000) {
            return await sock.sendMessage(jid, { text: "❌ Input too long (max 2000 characters)." });
        }

        const system =
            "You are a patient programming mentor. " +
            "Explain the given source code to a learner. Reply in exactly this structure:\n" +
            "- What it does: (1-2 lines)\n" +
            "- Key syntax/concepts: (short bullet points)\n" +
            "- Result/behavior: (1 line)\n" +
            "- Potential issues: (only if applicable, otherwise skip)\n" +
            "Keep it under 200 words. Never invent libraries or APIs.";

        try {
            // 🛡️ Rate Limit Check
            const limit = checkAILimit(sender);
            if (!limit.allowed) {
                return await sock.sendMessage(jid, { text: limit.reason }, { quoted: msg });
            }

            await sock.sendMessage(jid, { react: { text: "📖", key: msg.key } });
            await sock.sendMessage(jid, { text: "📖 Explaining code... ⏳" });

            const userPrompt = `Explain this source code:\n\n${input}`;
            const result = await askAI(userPrompt, system);

            const header = `┌───[ 📖 EXPLAINCODE ]\n└────────────────────\n\n`;
            await sock.sendMessage(jid, {
                text: header + clipText(result)
            }, { quoted: msg });

        } catch (err) {
            console.error("Explain code error:", err);
            await sock.sendMessage(jid, { text: "⚠️ Code explanation failed. Please try again later." }, { quoted: msg });
        }
    }
};