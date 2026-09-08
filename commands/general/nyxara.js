const path = require("path");
const fs = require("fs");

module.exports = {
    name: "nyxara",
    aliases: ["nyx", "nerio"],
    description: "Display Nyxara / Nerio developer profile & portfolio.",
    category: "general",
    execute: async ({ sock, jid, msg }) => {
        try {
            const text = `👨‍💻 *THE NYXARA PROFILE*\n` +
                         `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                         `✨ *Name:* Nyxara  Nerio\n` +
                         `📱 *WhatsApp:* @nyxara(https://wa.me/0707848992)\n` +
                         `👨‍💻 *Bio:* My passion and only purpose here is coding. I love building tools that make life easier and more fun!\n\n` +
                         `🌐 *Portfolio:* https://my-portfolio-yjx7.vercel.app/\n` +
                         `📂 *GitHub:* https://github.com/whicklian\n\n` +
                         `⏳ *TIME: THE ULTIMATE TRACER*\n` +
                         `_\"Magic is just science we don't understand yet, and code is the closest thing to magic I've found.\"_`;

            const imgPath = path.join(__dirname, "../../assets/nyxara.jpg");
            let imagePayload;
            if (fs.existsSync(imgPath)) {
                imagePayload = fs.readFileSync(imgPath);
            } else {
                imagePayload = fs.readFileSync(path.join(__dirname, "../../assets/Nexuspic.jpg"));
            }

            await sock.sendMessage(jid, { image: imagePayload, mimetype: "image/jpeg", caption: text }, { quoted: msg });
        } catch (e) {
            console.error("Error in .nyxara command:", e.message);
            await sock.sendMessage(jid, { text: "❌ Failed to load profile." }, { quoted: msg });
        }
    }
};
