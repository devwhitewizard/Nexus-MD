const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = {
    name: "qrcode",
    description: "Generate a QR code from text or a URL.",
    category: "developer",
    usage: "<text>",
    aliases: [],
    execute: async ({ sock, jid, args, msg }) => {
        const text = args.join(" ").trim();
        if (!text) {
            return await sock.sendMessage(jid, {
                text:
                    "❌ Missing input\n\n" +
                    "Usage:\n.qrcode <text>\n\n" +
                    "Examples:\n" +
                    "• .qrcode https://example.com\n" +
                    "• .qrcode Hello World"
            });
        }

        // Reasonable input limit to prevent abuse
        if (text.length > 1000) {
            return await sock.sendMessage(jid, { text: "❌ Input too long (max 1000 characters)." });
        }

        const tmpPath = path.join(os.tmpdir(), `nexus_dev_qrcode_${Date.now()}.png`);

        try {
            await QRCode.toFile(tmpPath, text, {
                type: "png",
                width: 512,
                margin: 2,
                color: {
                    dark: "#000000",
                    light: "#FFFFFF"
                }
            });

            const imageBuffer = fs.readFileSync(tmpPath);

            await sock.sendMessage(jid, {
                image: imageBuffer,
                caption:
                    `┌───[ 👨‍💻 QRCODE ]\n` +
                    `│ Content: ${text.length > 60 ? text.slice(0, 60) + "..." : text}\n` +
                    `└────────────────────\n\n` +
                    `_Scan with any QR reader • Nexus-1MD_`
            }, { quoted: msg });

        } catch (err) {
            console.error("QRCode generation error:", err);
            await sock.sendMessage(jid, { text: "❌ Failed to generate QR code. Please try again." });
        } finally {
            // Clean up temp file
            if (fs.existsSync(tmpPath)) {
                try { fs.unlinkSync(tmpPath); } catch (_) {}
            }
        }
    }
};