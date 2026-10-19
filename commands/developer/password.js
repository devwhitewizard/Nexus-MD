const { randomInt } = require("crypto");

module.exports = {
    name: "password",
    description: "Generate a cryptographically secure random password",
    category: "developer",
    usage: "[length]",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const DEFAULT_LENGTH = 16;
        const MAX_LENGTH = 64;

        let length = DEFAULT_LENGTH;
        if (args.length > 0) {
            length = parseInt(args[0], 10);
            if (isNaN(length) || length < 8 || length > MAX_LENGTH) {
                return await sock.sendMessage(jid, {
                    text: "❌ Invalid length\n\nLength must be a number between 8 and " + MAX_LENGTH + ".\nUsage:\n.password [length]\n\nExample:\n.password 16"
                });
            }
        }

        const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const lower = "abcdefghijklmnopqrstuvwxyz";
        const digits = "0123456789";
        const symbols = "!@#$%^&*()-_=+[]{}?";
        const all = upper + lower + digits + symbols;

        try {
            // Guarantee at least one character from each set
            let password = [
                upper[randomInt(upper.length)],
                lower[randomInt(lower.length)],
                digits[randomInt(digits.length)],
                symbols[randomInt(symbols.length)]
            ];
            for (let i = password.length; i < length; i++) {
                password.push(all[randomInt(all.length)]);
            }
            // Shuffle (Fisher-Yates with crypto)
            for (let i = password.length - 1; i > 0; i--) {
                const j = randomInt(i + 1);
                [password[i], password[j]] = [password[j], password[i]];
            }
            password = password.join("");

            const expl = "┌───[ 🔑 PASSWORD ]\n" +
                "│ Length: " + length + "\n" +
                "│ Result: `" + password + "`\n" +
                "└────────────────────";
            await sock.sendMessage(jid, { text: expl });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: "❌ Error generating password:\n```" + error.message + "```"
            });
        }
    }
};