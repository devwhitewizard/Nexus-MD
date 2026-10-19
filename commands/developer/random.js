const { randomInt } = require("crypto");

module.exports = {
    name: "random",
    description: "Generate a cryptographically secure random integer between min and max",
    category: "developer",
    usage: "<min> <max>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        if (args.length < 2) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.random 1 100\n\nExample:\n.random 1 100"
            });
        }

        const min = parseInt(args[0]);
        const max = parseInt(args[1]);

        if (isNaN(min) || isNaN(max)) {
            return await sock.sendMessage(jid, {
                text: "❌ Invalid input\n\nBoth min and max must be valid numbers.\nUsage:\n.random 1 100"
            });
        }

        if (min > max) {
            return await sock.sendMessage(jid, {
                text: "❌ Invalid range\n\nmin must be less than or equal to max.\nUsage:\n.random 1 100"
            });
        }

        if (min === max) {
            return await sock.sendMessage(jid, {
                text: "❌ Same values\n\nmin and max cannot be the same value.\nUsage:\n.random 1 100"
            });
        }

        // sensible integer limits to prevent abuse
        if (max - min > 1000000) {
            return await sock.sendMessage(jid, {
                text: "❌ Range too large\n\nThe range between min and max should not exceed 1,000,000.\nUsage:\n.random 1 100000"
            });
        }

        try {
            const randomValue = randomInt(min, max + 1);
            const expl = "┌───[ 🎲 RANDOM ]\n" +
                "│ Range: " + min + " - " + max + "\n" +
                "│ Result: " + randomValue + "\n" +
                "└────────────────────";
            await sock.sendMessage(jid, { text: expl });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: "❌ Error generating random number:\n```" + error.message + "```"
            });
        }
    }
};