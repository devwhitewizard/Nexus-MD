module.exports = {
    name: "ping",
    aliases: ["p"],
    description: "Check bot speed",
    category: "general",
    execute: async (ctx) => {
        const { sock, jid, msg } = ctx;
        // Two normal messages, no edits — edited replies often render as
        // "Waiting for this message" on WhatsApp clients.
        const start = Date.now();
        await sock.sendMessage(jid, { text: "⏱ Testing speed..." });
        const latency = Date.now() - start;
        await sock.sendMessage(jid, {
            text: `🏓 *Pong!*\n⏱ Latency: \`${latency}ms\``
        }, { quoted: msg });
    }
};
