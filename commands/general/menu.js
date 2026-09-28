const path = require("path");
const fs = require("fs");
const { getUserCount } = require("../../nexus/userModel");
const { getSettings } = require("../../lib/settings");
const { sendButtonMessage } = require("../../lib/utils");

// Category display config: emoji + label + description
const CATEGORY_META = {
    general: { icon: "🛠️", label: "GENERAL", desc: "Quick tools & general utility commands" },
    download: { icon: "📥", label: "DOWNLOAD", desc: "Media & video downloader tools" },
    ai: { icon: "🤖", label: "AI", desc: "Artificial intelligence & chatbot tools" },
    media: { icon: "🎬", label: "MEDIA", desc: "Audio, video & image processing" },
    sticker: { icon: "🎨", label: "STICKER", desc: "Sticker creation & management" },
    fun: { icon: "🎉", label: "FUN", desc: "Fun commands & entertainment" },
    games: { icon: "🕹️", label: "GAMES", desc: "Interactive games & trivia" },
    social: { icon: "🤝", label: "SOCIAL", desc: "Social tools & interaction" },
    anime: { icon: "🎭", label: "ANIME", desc: "Anime info & media" },
    economy: { icon: "💰", label: "ECONOMY", desc: "Virtual currency & economy system" },
    sports: { icon: "⚽", label: "SPORTS", desc: "Live sports scores & fixtures" },
    news: { icon: "📰", label: "NEWS", desc: "Latest headlines & news updates" },
    religion: { icon: "⛪", label: "RELIGION", desc: "Religious & spiritual tools" },
    dp: { icon: "🖼️", label: "DP", desc: "Display picture generators" },
    group: { icon: "👥", label: "GROUP", desc: "Group chat management tools" },
    admin: { icon: "⚙️", label: "ADMIN", desc: "Admin moderation controls" },
    system: { icon: "🛰️", label: "SYSTEM", desc: "Bot diagnostics & status" },
    textmaker: { icon: "✨", label: "TEXTMAKER", desc: "Stylized text & logo generators" },
    owner: { icon: "📦", label: "OWNER", desc: "Bot configuration & owner controls" }
};

// Strict, clean display order
const CATEGORY_ORDER = [
    "general", "download", "ai", "media", "sticker", "fun", "games",
    "social", "anime", "economy", "sports", "news", "religion", "dp",
    "group", "admin", "system", "textmaker", "owner"
];

// Usage parameter hints for commands
const USAGE_HINTS = {
    // Textmaker Logo Generators
    "1917": "<text>",
    advancedglow: "<text>",
    arena: "<text>",
    arting: "<text>",
    blackpink: "<text>",
    blackpinkstyle: "<text>",
    cartoonstyle: "<text>",
    comic: "<text>",
    corntext: "<text>",
    deadpool: "<text>",
    devil: "<text>",
    devilwings: "<text>",
    dragonball: "<text>",
    effectclouds: "<text>",
    fire: "<text>",
    flagtext: "<text>",
    flux: "<text>",
    galaxystyle: "<text>",
    galaxywallpaper: "<text>",
    glitch: "<text>",
    glowingtext: "<text>",
    glossysilver: "<text>",
    hacker: "<text>",
    ice: "<text>",
    impressive: "<text>",
    leaves: "<text>",
    light: "<text>",
    luxurygold: "<text>",
    makingneon: "<text>",
    matrix: "<text>",
    metallic: "<text>",
    multicoloredneon: "<text>",
    naruto: "<text>",
    neon: "<text>",
    painttext: "<text>",
    pixelglitch: "<text>",
    pubglogo: "<text>",
    purple: "<text>",
    royaltext: "<text>",
    sand: "<text>",
    snow: "<text>",
    summerbeach: "<text>",
    textonwetglass: "<text>",
    thunder: "<text>",
    typography: "<text>",
    underwater: "<text>",
    vintagetext: "<text>",
    wingslogo: "<text>",
    wolfgalaxy: "<text>",

    // AI
    ai: "<question>",
    ask: "<question>",
    deepseek: "<query>",
    ds: "<query>",
    guru: "<query>",
    chat: "<message>",
    code: "<prompt>",
    explain: "<topic>",
    imagine: "<prompt>",
    draw: "<prompt>",

    // Download
    tiktok: "<link>",
    tt: "<link>",
    instagram: "<link>",
    ig: "<link>",
    reels: "<link>",
    facebook: "<link>",
    fb: "<link>",
    twitter: "<link>",
    tw: "<link>",
    linkedin: "<link>",
    li: "<link>",
    play: "<song>",
    yt: "<link>",

    // Admin & Group
    kick: "<user>",
    ban: "<user>",
    mute: "[time]",
    unmute: "",
    promote: "<user>",
    demote: "<user>",
    tagall: "[reason]",
    hidetag: "<message>",

    // News
    news: "<topic>",
    bbcnews: "",
    citizennews: "",
    technews: "",
    cnn: "",
    headlines: "",

    // Sports
    player: "<name>",
    team: "<name>",
    stadium: "<name>",
    standings: "[league]",
    fixtures: "[league]",
    topscorers: "[league]",
    gamehistory: "<match>",
    livesports: "[query]",
    flive: "",
    flive2: "",
    predictions: "",
    fstream: "",
    fnews: "",
    blive: "",
    livescore: "",
    sportnews: "",
    sportscats: "",
    cricket: "[query]",
    football: "[query]",
    nba: "[query]",

    // General & Tools
    savestatus: "<reply>",
    save: "<reply>",
    sv: "<reply>",
    sharestatus: "[message]",
    gcstatus: "[message]",
    hideviewchannel: "<on/off>",
    statusemoji: "<emojis>",
    mode: "[public/private]",
    calc: "<math>",
    translate: "<text>",
    weather: "<city>",
    wiki: "<query>",
    qr: "<text>",
    readqr: "",
    tts: "<text>",
    shorten: "<link>",
    ocr: "<image>",
    menu: "[cat]"
};

/**
 * Format commands in strict vertical tree list:
 * │ > .command <args>
 */
function formatCategoryCommands(cmds) {
    return cmds.map(c => {
        let hint = c.usage || USAGE_HINTS[c.name] || "";
        if (typeof hint === "string" && hint.startsWith(".")) {
            const parts = hint.trim().split(/\s+/);
            hint = parts.length > 1 ? parts.slice(1).join(" ") : "";
        }
        const paramStr = hint ? ` ${hint}` : "";
        return `│ > .${c.name}${paramStr}`;
    }).join("\n");
}

module.exports = {
    name: "menu",
    aliases: ["help", "list", "m"],
    description: "List all commands in stylized tree layout",
    category: "general",
    noAutoDelete: true,

    execute: async (ctx) => {
        const { sock, jid, args, commands } = ctx;
        const pushName = ctx.msg?.pushName || ctx.msg?.key?.participant?.split("@")[0] || "User";

        // 🕰️ Date & Time
        const date = new Date().toLocaleDateString("en-GB");
        const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
        const hours = new Date().getHours();
        let greeting = "Good Night 🌙";
        if (hours < 12) greeting = "Good Morning 🌅";
        else if (hours < 18) greeting = "Good Day 🤠";
        else greeting = "Good Evening 🌃";

        const settings = getSettings();
        const botName = settings.botName || "Nexus-MD";
        const menuStyle = settings.menuStyle || 1;
        const CHANNEL_URL = "https://whatsapp.com/channel/0029VbD62UY7UYU6cftzu02";

        try {
            // ── De-duplicate commands ──────────────────────────────────────────
            const allCommands = [...commands.values()];
            const uniqueCommands = allCommands.filter((cmd, idx, self) =>
                idx === self.findIndex(t => t.name === cmd.name)
            );

            // ── Build grouped map ──────────────────────────────────────────────
            const grouped = {};
            for (const cmd of uniqueCommands) {
                const cat = (cmd.category || "general").toLowerCase();
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(cmd);
            }
            // Sort commands alphabetically within each category
            for (const cat of Object.keys(grouped)) {
                grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
            }

            // ── Determine ordered category list ────────────────────────────────
            const allCats = [...new Set([
                ...CATEGORY_ORDER.filter(c => grouped[c]),
                ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c))
            ])];

            const channelButtons = [
                { text: "📢 Follow Channel", url: CHANNEL_URL }
            ];

            // ── Helper to resolve bot banner image ─────────────────────────────
            let banner = null;
            try {
                if (settings.botImage && settings.botImage.startsWith("http")) {
                    banner = { url: settings.botImage };
                } else {
                    const newPic = path.join(__dirname, "../../assets/botnexus.png");
                    const oldPic = path.join(__dirname, "../../assets/Nexuspic.jpg");
                    const picPath = fs.existsSync(newPic) ? newPic : oldPic;
                    if (fs.existsSync(picPath)) banner = fs.readFileSync(picPath);
                }
            } catch (_) { banner = null; }

            // ── Handle .menu <category / number / command> ──────────────────────
            if (args.length > 0) {
                const targetRaw = args[0].toLowerCase().trim().replace(/^\./, "");

                // Resolve numeric selection (e.g. 1 -> general, 01 -> general)
                let targetCategory = null;
                const num = parseInt(targetRaw, 10);
                if (!isNaN(num) && num >= 1 && num <= allCats.length) {
                    targetCategory = allCats[num - 1];
                } else if (grouped[targetRaw]) {
                    targetCategory = targetRaw;
                }

                // ① Match a category
                if (targetCategory && grouped[targetCategory]) {
                    const meta = CATEGORY_META[targetCategory] || { icon: "📁", label: targetCategory.toUpperCase() };
                    const cmds = grouped[targetCategory];
                    let txt = `┌───[ ${meta.icon} ${meta.label} ] [${cmds.length}]\n`;
                    txt += formatCategoryCommands(cmds) + "\n";
                    txt += `└─────────────────────────────\n\n`;
                    txt += `💡 _Tip: Type \`.menu <command>\` (e.g. \`.menu ping\`) for details._`;
                    return await sendButtonMessage(sock, jid, txt, botName, channelButtons, banner, ctx.msg);
                }

                // ② Match a specific command or alias
                const foundCmd = commands.get(targetRaw);
                if (foundCmd) {
                    const meta = CATEGORY_META[foundCmd.category] || { icon: "📁", label: (foundCmd.category || "general").toUpperCase() };
                    let hint = foundCmd.usage || USAGE_HINTS[foundCmd.name] || "";
                    if (typeof hint === "string" && hint.startsWith(".")) {
                        const parts = hint.trim().split(/\s+/);
                        hint = parts.length > 1 ? parts.slice(1).join(" ") : "";
                    }
                    let card = `┌───[ 🔍 COMMAND HELP ]\n`;
                    card += `│ > Command: .${foundCmd.name}${hint ? " " + hint : ""}\n`;
                    if (foundCmd.description) card += `│ > Description: ${foundCmd.description}\n`;
                    if (foundCmd.category) card += `│ > Category: ${meta.icon} ${meta.label}\n`;
                    if (foundCmd.aliases && foundCmd.aliases.length && !foundCmd.hideAliases)
                        card += `│ > Aliases: ${foundCmd.aliases.map(a => `.${a}`).join(", ")}\n`;
                    card += `└─────────────────────────────`;
                    return await sendButtonMessage(sock, jid, card, botName, channelButtons, banner, ctx.msg);
                }

                // ③ Category / command not found
                let catList = `⚠️ *"${targetRaw}" not found.*\n\n📂 *Available Categories:*\n`;
                allCats.forEach((c, idx) => {
                    const m = CATEGORY_META[c] || { icon: "📁", label: c.toUpperCase() };
                    const numStr = String(idx + 1).padStart(2, "0");
                    catList += `▸ *[${numStr}]* ${m.icon} *${m.label}* [${grouped[c]?.length || 0}]\n`;
                });
                catList += `\n💡 _Reply with a number (1-${allCats.length}) or type \`.menu download\`_`;
                return await sock.sendMessage(jid, { text: catList }, { quoted: ctx.msg });
            }

            // ── Main menu (No arguments passed) ───────────────────────────
            let userCount = 1;
            try {
                userCount = await Promise.race([
                    getUserCount(),
                    new Promise(res => setTimeout(() => res(1), 1000))
                ]);
            } catch (_) { userCount = 1; }

            const totalCmdCount = uniqueCommands.length;

            // Header card
            let body = "";
            body += `┌───[ 💎 ${botName.toUpperCase()} ]\n`;
            body += `│ > User: ${pushName}\n`;
            body += `│ > Greeting: ${greeting}\n`;
            body += `│ > Date: ${date}\n`;
            body += `│ > Time: ${time}\n`;
            body += `│ > Total Commands: [${totalCmdCount}]\n`;
            body += `│ > Active Users: ${userCount}\n`;
            body += `│ > Menu Style: Style ${menuStyle} (${menuStyle === 2 ? "Full Tree" : "Category Index"})\n`;
            body += `└─────────────────────────────\n\n`;

            if (menuStyle === 1) {
                // ── Style 1: Category Index Layout ────────────────────────────────
                body += `📂 *SELECT A CATEGORY:* Reply with a number (1-${allCats.length}) or type \`.menu <category>\`\n\n`;
                
                allCats.forEach((cat, idx) => {
                    const cmds = grouped[cat] || [];
                    const meta = CATEGORY_META[cat] || { icon: "📁", label: cat.toUpperCase(), desc: `${cat} commands` };
                    const numStr = String(idx + 1).padStart(2, "0");

                    body += `┌───[ ${numStr} ] ${meta.icon} ${meta.label} [${cmds.length}]\n`;
                    body += `│ > ${meta.desc}\n`;
                    body += `└─────────────────────────────\n\n`;
                });

                body += `💡 *How to explore commands:*\n`;
                body += `▸ Reply with a number (e.g. *1* or *02*)\n`;
                body += `▸ Type *.menu <category>* (e.g. *.menu download*)\n`;
                body += `▸ Type *.menu <command>* (e.g. *.menu ping*)\n`;
                body += `▸ Change menu layout: *.menustyle 2*`;
            } else {
                // ── Style 2: Full Expanded Tree Layout ─────────────────────────────
                for (const cat of allCats) {
                    const cmds = grouped[cat];
                    if (!cmds || cmds.length === 0) continue;
                    const meta = CATEGORY_META[cat] || { icon: "📁", label: cat.toUpperCase() };

                    body += `┌───[ ${meta.icon} ${meta.label} ] [${cmds.length}]\n`;
                    body += formatCategoryCommands(cmds) + "\n";
                    body += `└─────────────────────────────\n\n`;
                }

                body += `💡 *Quick Tips:*\n`;
                body += `▸ Type *.menu <category>* (e.g. *.menu download*)\n`;
                body += `▸ Type *.menu <command>* (e.g. *.menu ping*)\n`;
                body += `▸ Switch layout: *.menustyle 1*`;
            }

            return await sendButtonMessage(sock, jid, body.trim(), botName, channelButtons, banner, ctx.msg);

        } catch (e) {
            console.error("❌ Menu error:", e);
            await sock.sendMessage(jid, { text: "⚠️ Error loading menu. Try again." });
        }
    }
};

