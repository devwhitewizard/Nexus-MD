module.exports = {
    name: "regexcheck",
    description: "Test whether text matches a regular expression",
    category: "developer",
    usage: "<pattern> | <text>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ");
        const parts = input.split(" | ");
        if (parts.length !== 2) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing or malformed input\n\nUsage:\n.regexcheck ^[0-9]+$ | 12345\n\nExample:\n.regexcheck ^[0-9]+$ | 12345"
            });
        }

        const pattern = parts[0].trim();
        const text = parts[1].trim();

        if (!pattern || !text) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing pattern or text\n\nUsage:\n.regexcheck ^[0-9]+$ | 12345"
            });
        }
        if (pattern.length > 300 || text.length > 1000) {
            return await sock.sendMessage(jid, {
                text: "❌ Input too long (pattern max 300, text max 1000 characters)."
            });
        }

        try {
            const regex = new RegExp(pattern);
            const result = regex.test(text);

            let status;
            let label;
            if (result) {
                status = "✅ MATCH";
                label = "MATCH";
            } else {
                status = "❌ NO MATCH";
                label = "NO MATCH";
            }

            const expl = "┌───[ 🔎 REGEX TEST ]\n" +
                "│ Pattern: " + pattern + "\n" +
                "│ Text: " + text + "\n" +
                "│ Result: " + status + "\n" +
                "└────────────────────";

            await sock.sendMessage(jid, { text: expl });
        } catch (regexError) {
            await sock.sendMessage(jid, {
                text: "❌ Invalid regular expression\n```" + pattern + "` is not a valid regex pattern.\n```" + regexError.message + ""
            });
        }
    }
};