module.exports = {
    name: "regex",
    description: "Explain a regular expression",
    category: "developer",
    usage: "<pattern>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const pattern = args.join(" ").trim();
        if (!pattern || pattern.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.regex ^[A-Z][a-z]+$\n\nExample:\n.regex ^[A-Z][a-z]+$"
            });
        }

        try {
            const regex = new RegExp(pattern);
            const flags = regex.flags || "";
            let expl = "┌───[ 👨‍💻 REGEX ]\n";
            expl += "│ Pattern: `" + pattern + "`\n";
            expl += "│ Flags: " + flags + "\n";
            expl += "│\n";

            if (pattern.includes("^") && pattern.includes("$")) {
                expl += "│ Anchor: ^ (start) $ (end)\n";
            }
            if (pattern.includes("[") && pattern.includes("]")) {
                expl += "│ Character class: [ ] matches any character inside\n";
            }
            if (pattern.includes("*")) {
                expl += "│ Quantifier: * matches 0 or more\n";
            }
            if (pattern.includes("+")) {
                expl += "│ Quantifier: + matches 1 or more\n";
            }
            if (pattern.includes("\\d")) {
                expl += "│ Predefined: \\d matches any digit\n";
            }
            if (pattern.includes("\\w")) {
                expl += "│ Predefined: \\w matches any word character\n";
            }
            if (pattern.includes("\\s")) {
                expl += "│ Predefined: \\s matches any whitespace\n";
            }

            expl += "│\n";

            // Example matches
            try {
                const testRegex = new RegExp(pattern);
                const testCases = ["test", "Test", "123", "abc-DEF"];
                const matches = testCases.filter(test => testRegex.test(test));
                if (matches.length > 0) {
                    expl += "│ Example matches: " + matches.join(", ") + "\n";
                }
            } catch (e) {}

            // Example non-matches
            try {
                const testRegex = new RegExp(pattern);
                const testCases = ["test", "Test", "123", "abc-DEF"];
                const nonMatches = testCases.filter(test => !testRegex.test(test));
                if (nonMatches.length > 0) {
                    expl += "│ Example non-matches: " + nonMatches.join(", ") + "\n";
                }
            } catch (e) {}

            expl += "└────────────────────";
            await sock.sendMessage(jid, { text: expl });
        } catch (regexError) {
            await sock.sendMessage(jid, {
                text: "❌ Invalid regular expression\n```" + pattern + "` is not a valid regex pattern.\n```" + regexError.message + ""
            });
        }
    }
};