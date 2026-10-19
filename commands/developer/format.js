const { clipText, inputTooLong, MAX_INPUT_CHARS } = require("../../lib/devSafety");

module.exports = {
    name: "format",
    description: "Beautify/format source code",
    category: "developer",
    usage: "<code>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.format <code>\n\nExamples:\n• .format {\"a\":1}\n• .format CSS/JS/HTML snippet"
            });
        }
        if (inputTooLong(input)) {
            return await sock.sendMessage(jid, {
                text: `❌ Input too long (max ${MAX_INPUT_CHARS} characters).`
            });
        }

        const code = input.slice(0, MAX_INPUT_CHARS);

        // ── JSON: deterministic formatter ────────────────────────────────────
        if (/^[\[{]/.test(code) && /[\]}]$/.test(code)) {
            try {
                const parsed = JSON.parse(code);
                await sock.sendMessage(jid, {
                    text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: JSON\n└────────────────────\n\n\`\`\`json\n${clipText(JSON.stringify(parsed, null, 2), 3000)}\n\`\`\``
                }, { quoted: msg });
                return;
            } catch (e) { /* fall through to other formats */ }
        }

        // ── HTML: normalize spacing per line ─────────────────────────────────
        if (/<\/?(html|body|head|div|span|p|nav|section|ul|ol|li|a|button|table|tr|td|h[1-6])\b/i.test(code)) {
            const lines = code.split(/\r?\n/).slice(0, 300);
            const result = lines
                .map(line => line.replace(/[ \t]+/g, " ").trim())
                .filter(Boolean)
                .join("\n");
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: HTML\n└────────────────────\n\n\`\`\`html\n${clipText(result, 3000)}\n\`\`\``
            }, { quoted: msg });
            return;
        }

        // ── CSS: normalize into "selector { property: value; }" lines ───────
        if (/\{[^}]*:[^}]*\}/.test(code) && /(?:color|font|padding|margin|background|border|width|height|display)\s*:/i.test(code)) {
            const blocks = code.split(/\r?\n/).reduce((acc, line) => {
                acc.push(line.trim());
                return acc;
            }, []).join("\n")
                .replace(/\{/g, "\n{\n")
                .replace(/\}/g, "\n}\n")
                .replace(/;/g, ";\n")
                .split("\n").map(s => s.trim()).filter(Boolean);
            let depth = 0;
            const css = blocks.map(part => {
                if (part === "}") { depth = Math.max(0, depth - 1); return "}"; }
                if (part === "{") return "{";
                return "  ".repeat(Math.min(depth, 6)) + part;
            }).join("\n");
            await sock.sendMessage(jid, {
                text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: CSS\n└────────────────────\n\n\`\`\`css\n${clipText(css, 3000)}\n\`\`\``
            }, { quoted: msg });
            return;
        }

        // ── JavaScript: clean 2-space brace-depth indent ─────────────────────
        let depth = 0;
        const jsOut = code.split(/\r?\n/).slice(0, 300).map(line => {
            const trimmed = line.trim();
            if (!trimmed) return "";
            let indent = depth;
            if (trimmed.startsWith("}")) indent = Math.max(0, depth - 1);
            const opens = (trimmed.match(/\{/g) || []).length;
            const closes = (trimmed.match(/\}/g) || []).length;
            depth = Math.max(0, Math.min(10, depth + opens - closes));
            return "  ".repeat(Math.min(indent, 10)) + trimmed;
        }).join("\n");
        await sock.sendMessage(jid, {
            text: `┌───[ 👨‍💻 FORMAT ]\n│ Format: JavaScript\n└────────────────────\n\n\`\`\`js\n${clipText(jsOut, 3000)}\n\`\`\``
        }, { quoted: msg });
    }
};