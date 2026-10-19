module.exports = {
    name: "color",
    description: "Analyze a HEX color",
    category: "developer",
    usage: "<hex>",
    aliases: [],
    execute: async ({ sock, jid, msg, args }) => {
        const hexInput = args.join(" ").trim();
        if (!hexInput || hexInput.length === 0) {
            return await sock.sendMessage(jid, {
                text: "❌ Missing input\n\nUsage:\n.color #ff0000"
            });
        }

        // Validate HEX format - support #RGB and #RRGGBB
        const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
        if (!hexRegex.test(hexInput)) {
            return await sock.sendMessage(jid, {
                text: "❌ Invalid HEX format\n\nUsage:\n.color #ff0000\nSupports: #RGB or #RRGGBB"
            });
        }

        // Expand #RGB to #RRGGBB
        let hex = hexInput;
        if (hex.length === 4) {
            hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        } else if (hex.length === 5) {
            // This shouldn't happen with regex above, but just in case
            hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] + hex[4] + hex[4];
        }

        // Convert to RGB
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        // Convert to HSL
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;

        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        let h, l, s;

        l = (max + min) / 2;

        if (max === min) {
            h = 0;
            s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            if (max === rNorm) {
                h = (60 * ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0))) / 360;
            } else if (max === gNorm) {
                h = (60 * ((bNorm - rNorm) / d + 2)) / 360;
            } else {
                h = (60 * ((rNorm - gNorm) / d + 4)) / 360;
            }
        }

        const hStr = Math.round(h * 360).toString();
        const sStr = Math.round(s * 100).toString() + "%";
        const lStr = Math.round(l * 100).toString() + "%";

        const expl = "┌───[ 👨‍💻 COLOR ]\n" +
            "│ HEX: " + hexInput.toUpperCase() + "\n" +
            "│ RGB: rgb(" + r + ", " + g + ", " + b + ")\n" +
            "│ HSL: hsl(" + hStr + ", " + sStr + ", " + lStr + ")\n" +
            "└────────────────────";

        await sock.sendMessage(jid, { text: expl });
    }
};