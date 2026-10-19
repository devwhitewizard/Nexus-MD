module.exports = {
    name: "format",
    description: "Beautify/format source code",
    category: "developer",
    usage: "<code>",
    aliases: [],
    execute: async ({ sock, jid, msg, args, text }) => {
        const codeInput = args.join(" ");
        if (!codeInput || codeInput.trim().length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.format <code>\n\nExample:\n.format const x = 1;\nconsole.log(x);"
            });
        }

        const input = codeInput.trim();
        let formatted;

        // Try JSON first
        try {
            const parsed = JSON.parse(input);
            formatted = JSON.stringify(parsed, null, 2);
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: JSON\n│\n\`\`\`\n${formatted}\n\`\`\``
            });
            return;
        } catch (e) {
            // Not valid JSON, continue to other formats
        }

        // Check for HTML
        if (input.includes("<html") || input.includes("<div") || input.includes("<span") || input.includes("<p")) {
            // Basic HTML formatting - just pretty print with indentation
            const htmlLines = input.split(/\n/);
            let indentLevel = 0;
            let result = "";
            const htmlTags = /<([a-zA-Z/!][1-6]?)[^>]*>/g;

            for (const line of htmlLines) {
                const stripped = line.replace(/^\s+/, "");
                const indent = stripped.match(/^\s*/)?.[0].length || 0;
                result += " ".repeat(indent * 2) + stripped + "\n";
            }

            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: HTML\n│\n\`\`\`html\n${result}\n\`\`\``
            });
            return;
        }

        // Check for CSS
        if (input.includes("{") && input.includes("}") && (input.includes("color") || input.includes("font") || input.includes("padding") || input.includes("margin"))) {
            // Basic CSS formatting
            const cssLines = input.split(/\n/);
            let result = cssLines.map(line => "  " + line.trim()).join("\n");
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: CSS\n│\n\`\`\`css\n${result}\n\`\`\``
            });
            return;
        }

        // Basic JavaScript formatting - add indentation
        // Simple approach: indent lines that look like code statements
        const jsLines = input.split(/\n/);
        let result = jsLines.map(line => "  " + (line.trim() || line)).join("\n");

        await sock.sendMessage(jid, {
            text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: JavaScript\n│\n\`\`\`js\n${result}\n\`\`\``
        });
    }
};