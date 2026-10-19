module.exports = {
    name: "unix",
    description: "Convert between Unix timestamp and date",
    category: "developer",
    usage: "<timestamp/date>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input || input.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.unix 1790000000\nor\n.unix 2026-10-17"
            });
        }

        const now = new Date();
        const inputNum = Number(input);
        const isTimestamp = Number.isInteger(inputNum) && inputNum > 1000000000000000;

        try {
            let result;
            let inputDate;

            if (isTimestamp) {
                // Input is milliseconds
                inputDate = new Date(inputNum);
            } else if (!isNaN(inputNum)) {
                // Input is seconds
                inputDate = new Date(inputNum * 1000);
            } else {
                // Input is a date string
                inputDate = new Date(input);
            }

            if (inputDate && !isNaN(inputDate.getTime())) {
                const utcSeconds = Math.floor(inputDate.getTime() / 1000);
                const utcMilliseconds = inputDate.getTime();
                const utcString = inputDate.toISOString();

                result = "┌───[ 🕐 UNIX ]\n";
                if (isTimestamp || !isNaN(inputNum)) {
                    result += "│ Input: " + input + "\n";
                }
                result += "│ Unix seconds: " + utcSeconds + "\n";
                result += "│ Unix milliseconds: " + utcMilliseconds + "\n";
                result += "│ UTC: " + utcString + "\n";
                result += "└────────────────────";
            } else {
                throw new Error("Invalid date");
            }

            await sock.sendMessage(jid, { text: result });
        } catch (error) {
            await sock.sendMessage(jid, {
                text: "❌ Invalid date/timestamp\n```" + input + "``` is not a valid Unix timestamp or date.\n```" + error.message + "```"
            });
        }
    }
};