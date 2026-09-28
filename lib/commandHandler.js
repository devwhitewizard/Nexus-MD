const fs = require("fs");
const path = require("path");
const { prefixes, processedIdLimit } = require("../config");
const { runMiddleware, isOwner: checkIsOwner } = require("./middleware");
const { parseMessage, unwrapMessageContent } = require("./messageParser");
const { isOnCooldown, groupSpamGuard } = require("./cooldown");
const { loadPlugins } = require("../plugins/pluginLoader");
const { addXP } = require("../nexus/userModel");
const { getSettings } = require("./settings");
const { getGame, processGameInput } = require("./gameState");

// ── Load all commands from /commands folder (Flat Directory) ─────────────────
const commands = new Map();
const commandsDir = path.join(__dirname, "../commands");

const loadCommands = () => {
    if (!fs.existsSync(commandsDir)) return { fileCount: 0, errors: [] };

    // Helper to recursively get all JS files
    const getFilesRecursive = (dir) => {
        let results = [];
        if (!fs.existsSync(dir)) return results;
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(getFilesRecursive(filePath));
            } else if (file.endsWith(".js") && !file.endsWith(".example")) {
                results.push(filePath);
            }
        });
        return results;
    };

    let fileCount = 0;
    const errors = [];
    const files = getFilesRecursive(commandsDir);

    for (const fullPath of files) {
        const relativePath = path.relative(commandsDir, fullPath).replace(/\\/g, "/");
        try {
            delete require.cache[require.resolve(fullPath)];
            const module = require(fullPath);

            const register = (cmd) => {
                if (!cmd.name || !cmd.execute) return false;
                if (!cmd.category) cmd.category = "general";
                const cmdName = cmd.name.toLowerCase();
                commands.set(cmdName, cmd);
                if (cmd.aliases && Array.isArray(cmd.aliases)) {
                    cmd.aliases.forEach(alias => commands.set(alias.toLowerCase(), cmd));
                }
                return true;
            };

            const mainLoaded = register(module);
            Object.values(module).forEach(val => {
                if (typeof val === "object" && val !== module) register(val);
            });

            if (mainLoaded || Object.keys(module).length > 0) fileCount++;
        } catch (e) {
            errors.push({ file: relativePath, msg: e.message });
        }
    }

    return { fileCount, errors };
};

// ── Beautiful command-load summary card ───────────────────────────────────────
function printLoadSummary(fileCount, errors) {
    // Count unique commands per category (skip alias duplicates)
    const catMap = {};
    const seen = new Set();
    for (const [, cmd] of commands) {
        if (seen.has(cmd.name)) continue;
        seen.add(cmd.name);
        const cat = (cmd.category || "general").toLowerCase();
        catMap[cat] = (catMap[cat] || 0) + 1;
    }
    const cats       = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const uniqueCmds = seen.size;
    const aliasCount = commands.size - uniqueCmds;

    // ANSI 256-color palette — Emerald Acid (matrix green / ice cyan)
    const R  = "\x1b[0m";
    const B  = "\x1b[38;5;46m";    // green border
    const T  = "\x1b[1;38;5;82m";  // bold lime title
    const LB = "\x1b[38;5;118m";   // label
    const V  = "\x1b[38;5;87m";    // value cyan
    const DM = "\x1b[38;5;226m";   // gold footer
    const ER = "\x1b[38;5;196m";   // red errors

    const W = 46;
    const hline = (l, r) => `${B}${l}${"═".repeat(W)}${r}${R}`;

    // Strip ANSI codes to measure visible length
    const visLen = s => s.replace(/\x1b\[\d+(?:;\d+)*m/g, "").length;
    const padTo  = (s, w) => s + " ".repeat(Math.max(0, w - visLen(s)));

    const row = (label, val) => {
        const content = `${LB}  ${label}${R}  ${V}${val}${R}`;
        console.log(`${B}║${R} ${padTo(content, W - 1)}${B}║${R}`);
    };

    console.log("");
    console.log(hline("╔", "╗"));
    // Title row — pad to (W-2) visible characters inside the box
    const titleText = "  ⚡ COMMAND LOADER  ━  NEXUS-MD";
    const titleStyled = `${T}${titleText}${R}`;
    console.log(`${B}║${R}${padTo(" " + titleStyled, (W - 2) + (titleStyled.length - titleText.length))}  ${B}║${R}`);
    console.log(hline("╠", "╣"));
    row("📂 Files Scanned  :", `${fileCount}`);
    row("🔧 Commands       :", `${uniqueCmds}  (+${aliasCount} aliases)`);
    row("📁 Categories     :", `${cats.length}`);
    console.log(hline("╠", "╣"));
    for (const [cat, count] of cats.slice(0, 10)) {
        const bar = "▪".repeat(Math.min(count, 10));
        row(`  ${cat.padEnd(16)}`, `${bar} ${count}`);
    }
    if (cats.length > 10) row("  ...", `+${cats.length - 10} more categories`);
    if (errors.length > 0) {
        console.log(hline("╠", "╣"));
        row(`${ER}⚠  Load Errors${R}     :`, `${errors.length}`);
        for (const e of errors) {
            const truncated = e.msg.length > 36 ? e.msg.slice(0, 33) + "..." : e.msg;
            console.log(`${B}║${R} ${ER}  ✖ ${e.file}: ${truncated}${R}`);
        }
    }
    console.log(hline("╠", "╣"));
    const footerText = "  ✅ All systems go — commands ready";
    const footerStyled = `${DM}${footerText}${R}`;
    console.log(`${B}║${R}${padTo(" " + footerStyled, (W - 2) + (footerStyled.length - footerText.length))}  ${B}║${R}`);
    console.log(hline("╚", "╝"));
    console.log("");
}

const { fileCount: fc, errors: errs } = loadCommands() || { fileCount: 0, errors: [] };
printLoadSummary(fc, errs);

// ── Load plugins (can register extra commands into the map) ──────────────────
loadPlugins(commands);

// ── Duplicate-message guard ──────────────────────────────────────────────────
const processedIds = new Set();

function isDuplicate(msgId) {
    if (processedIds.has(msgId)) return true;
    processedIds.add(msgId);
    if (processedIds.size > processedIdLimit) {
        processedIds.delete(processedIds.values().next().value);
    }
    return false;
}

// ── Main message handler (attach to sock.ev) ─────────────────────────────────
async function handleMessages(sock, { messages, type }) {
    if (type !== "notify" || !Array.isArray(messages)) return;

    for (const msg of messages) {
        if (!msg?.message) continue; // protocol/receipt message, skip

        // Skip processing old commands (e.g. offline/history sync messages) to prevent boot-up lag
        if (msg.messageTimestamp) {
            let rawTs = msg.messageTimestamp;
            if (typeof rawTs === "object" && rawTs !== null) {
                rawTs = rawTs.toNumber ? rawTs.toNumber() : (rawTs.low || 0);
            }
            rawTs = Number(rawTs || 0);
            if (rawTs > 0) {
                const tsInSec = rawTs > 10000000000 ? Math.floor(rawTs / 1000) : rawTs;
                const msgAge = Math.floor(Date.now() / 1000) - tsInSec;
                if (msgAge > 120) {
                    console.log(`⏳ Skipping old message (${msgAge}s old)`);
                    continue;
                }
            }
        }

        // ── Robust Sender Identification ──────────────────────────────────────────
        const sender = msg.key.fromMe ? (global.myJid || msg.key.remoteJid) : (msg.key.participant || msg.key.remoteJid);
        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith("@g.us");

        // Skip duplicates
        if (isDuplicate(msg.key.id)) continue;

        // ── Handle Clickable/Interactive Responses ────────────────────────────────
        let textBody = "";
        const mContent = unwrapMessageContent(msg.message);
        const listResponse = mContent.listResponseMessage || mContent.buttonsResponseMessage || mContent.templateButtonReplyMessage || mContent.interactiveResponseMessage;

        if (listResponse) {
            textBody =
                listResponse.singleSelectReply?.selectedRowId ||
                listResponse.selectedButtonId ||
                listResponse.selectedId ||
                "";

            if (!textBody && mContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
                try {
                    const params = JSON.parse(mContent.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                    textBody = params.id || params.rowId || "";
                } catch (e) {}
            }
            console.log(`🖱️ Extracted Command From Click: [${textBody}]`);
        } else {
            const parsed = parseMessage(msg);
            textBody = parsed.text;
        }

        const text = textBody;
        if (!text) continue;

        // Must start with prefix OR be an interactive selection
        let commandName = "";
        let args = [];

        const settings = getSettings();
        const configuredPrefix = settings?.prefix || prefixes[0] || ".";
        const availablePrefixes = Array.from(new Set([configuredPrefix, ".", ...prefixes])).filter(Boolean);
        const prefix = availablePrefixes.find((p) => text.toLowerCase().startsWith(p.toLowerCase()));

        // Skip no-prefix messages from self (prevents bot from responding to its own responses/actions)
        // but allow menu shortcuts (e.g. "0"-"19") and active game session inputs
        const textLower = text.trim().toLowerCase();
        const isShortcut = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"].includes(textLower);
        const hasGameSession = typeof getGame === "function" && getGame(jid);

        if (msg.key.fromMe && !prefix && !isShortcut && !hasGameSession) continue;


    if (prefix) {
        const cleanText = text.slice(prefix.length);
        args = cleanText.trim().split(/\s+/);
        commandName = (args.shift() || "").toLowerCase();
    } else {
        // 🟢 Interactive/Shortcut Logic (No prefix)
        // ⚠️  ONLY activate number shortcuts when the user is replying to a bot message.
        //     This prevents random numbers in chat (e.g. "14 people agreed") from
        //     accidentally triggering menu navigation or settings panels.
        const textLower = text.trim().toLowerCase();
        const rawQuotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
            || msg.message?.extendedTextMessage?.contextInfo?.remoteJid;
        const quotedParticipant = toJid(rawQuotedParticipant);
        const isReplyToBot = (quotedParticipant && quotedParticipant === (global.myJid || "")) || msg.key.fromMe;

        if (isReplyToBot) {
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText = (
                quotedMessage?.conversation ||
                quotedMessage?.extendedTextMessage?.text ||
                quotedMessage?.imageMessage?.caption ||
                quotedMessage?.videoMessage?.caption ||
                ""
            ).toLowerCase();

            // Check if user is replying to a settings menu or detail panel
            const isSettingsReply = quotedText.includes("settings") || 
                                    quotedText.includes("reply 0 or .settings to go back") ||
                                    quotedText.includes("reply 0 to go back") ||
                                    quotedText.includes("reply 0 or \\.settings to go back") ||
                                    quotedText.includes("bot configuration") ||
                                    quotedText.includes("anti-link") ||
                                    quotedText.includes("anti-tag") ||
                                    quotedText.includes("anti-status-mention") ||
                                    quotedText.includes("anti-delete") ||
                                    quotedText.includes("status anti-delete") ||
                                    quotedText.includes("anti-call") ||
                                    quotedText.includes("group events") ||
                                    quotedText.includes("presence") ||
                                    quotedText.includes("auto view status") ||
                                    quotedText.includes("auto reply status") ||
                                    quotedText.includes("auto read") ||
                                    quotedText.includes("auto bio") ||
                                    quotedText.includes("chatbot (ai)") ||
                                    quotedText.includes("greet (dm auto-reply)") ||
                                    quotedText.includes("auto react") ||
                                    quotedText.includes("other commands");

            // Check if user is replying to the main category menu
            const isMainMenuReply = quotedText.includes("available categories:") || 
                                    quotedText.includes("menu") || 
                                    quotedText.includes("explore by typing .menu") ||
                                    quotedText.includes("type .menu <category>") ||
                                    quotedText.includes("type .menu <command>");

            if (isSettingsReply) {
                // Find choice based on quotedText
                let choice = null;
                if (quotedText.includes("settings") && (quotedText.includes("to configure:") || quotedText.includes("reply with"))) {
                    choice = "menu";
                } else if (quotedText.includes("bot configuration")) {
                    choice = 1;
                } else if (quotedText.includes("anti-link")) {
                    choice = 2;
                } else if (quotedText.includes("anti-tag") || quotedText.includes("anti-status-mention") || quotedText.includes("antitag")) {
                    choice = 3;
                } else if (quotedText.includes("status anti-delete")) {
                    choice = 5;
                } else if (quotedText.includes("anti-delete")) {
                    choice = 4;
                } else if (quotedText.includes("anti-call")) {
                    choice = 6;
                } else if (quotedText.includes("group events")) {
                    choice = 7;
                } else if (quotedText.includes("presence")) {
                    choice = 8;
                } else if (quotedText.includes("auto view status")) {
                    choice = 9;
                } else if (quotedText.includes("auto reply status")) {
                    choice = 10;
                } else if (quotedText.includes("auto read")) {
                    choice = 11;
                } else if (quotedText.includes("auto bio")) {
                    choice = 12;
                } else if (quotedText.includes("chatbot (ai)")) {
                    choice = 13;
                } else if (quotedText.includes("greet (dm auto-reply)")) {
                    choice = 14;
                } else if (quotedText.includes("auto react")) {
                    choice = 15;
                } else if (quotedText.includes("other commands")) {
                    choice = 16;
                }

                if (choice === "menu") {
                    const choiceNum = parseInt(textLower);
                    if (!isNaN(choiceNum) && choiceNum >= 0 && choiceNum <= 16) {
                        commandName = "settings";
                        args = [textLower];
                    }
                } else if (choice >= 1 && choice <= 16) {
                    const choiceNum = parseInt(textLower);
                    if (!isNaN(choiceNum)) {
                        if (choiceNum === 0) {
                            commandName = "settings";
                            args = ["0"];
                        } else if (choiceNum === choice) {
                            commandName = "settings";
                            args = [choice.toString(), "toggle"];
                        } else if (choiceNum >= 1 && choiceNum <= 16) {
                            commandName = "settings";
                            args = [choiceNum.toString()];
                        }
                    } else {
                        commandName = "settings";
                        args = [choice.toString(), textLower];
                    }
                }
            } else if (isMainMenuReply) {
                const menuShortcuts = { 
                    "1": "general", "2": "download", "3": "ai", "4": "media",
                    "5": "sticker", "6": "fun", "7": "games", "8": "social",
                    "9": "anime", "10": "economy", "11": "sports", "12": "news",
                    "13": "religion", "14": "dp", "15": "group", "16": "admin",
                    "17": "system", "18": "textmaker", "19": "owner"
                };

                if (menuShortcuts[textLower]) {
                    commandName = "menu";
                    args = [menuShortcuts[textLower]];
                }
            }
        }
    }

        const command = commands.get(commandName);

        // 🎮 Game State Interception — route plain answers to active game sessions
        if (!command) {
            const session = getGame(jid);
            if (session) {
                await processGameInput({ sock, jid, sender, text, msg, session });
            }
            continue;
        }


        const isOwner = checkIsOwner(sender);

        // 🌪️ Bot-Storm Protection (Group Command Throttling)
        if (isGroup && !isOwner) {
            if (!global.stormTracker) global.stormTracker = {};
            const now = Date.now();
            if (!global.stormTracker[jid]) global.stormTracker[jid] = { count: 0, last: now, mutedUntil: 0 };
            
            const storm = global.stormTracker[jid];
            
            // Check if currently muted for spam
            if (now < storm.mutedUntil) continue; 

            // Track command frequency
            if (now - storm.last < 30000) { // 30 second window
                storm.count++;
                if (storm.count > 8) { // If > 8 commands in 30 seconds
                    storm.mutedUntil = now + (2 * 60 * 1000); // Mute for 2 minutes
                    storm.count = 0; // Reset
                    console.log(`🛡️ Bot-Storm Detected in ${jid}. Silencing for 2 mins.`);
                    await sock.sendMessage(jid, { text: "🛡️ *Bot-Storm Protection:* Excessive commands detected. I'm silencing myself in this group for 2 minutes to keep your account safe. _(Owner can still use commands)_" });
                    continue;
                }
            } else {
                storm.count = 1;
                storm.last = now;
            }
        }
        if (settings && settings.publicMode === false && !isOwner) {
            // Return silently or with a message? User requested: "they should get bot in private mode"
            await sock.sendMessage(jid, { text: "🔒 *Access Denied:* This bot is in *Private Mode*." });
            continue;
        }
        if (settings && settings.lockedCommands) {
            const lockedList = settings.lockedCommands.split(",").map(c => c.trim().toLowerCase());
            if (lockedList.includes(command.name.toLowerCase()) && !isOwner) {
                await sock.sendMessage(jid, { text: `🔒 *Command Locked:* The \`.${command.name}\` command is restricted to owners only.` });
                continue;
            }
        }

        // ── Build context object ─────────────────────────────────────────────────
        const { msg: parsedMsg } = parseMessage(msg);
        const context = { sock, jid, sender, text, isGroup, msg: parsedMsg, args, commands, commandName };

        // ── Reward XP ────────────────────────────────────────────────────────────
        addXP(sender, 1);

        if (isGroup && groupSpamGuard(jid)) continue;

        const cd = isOnCooldown(sender, commandName, command.cooldown ?? 3000);
        if (cd.active) {
            await sock.sendMessage(jid, { text: `⏳ Slow down! Wait ${Math.ceil(cd.remaining / 1000)}s` });
            continue;
        }

        const startTime = Date.now();
        try {
            const senderNum = sender ? sender.split("@")[0] : "Unknown";
            // Mask: 2547817126867 → 2547***867
            const maskNum = (num) => {
                if (!num || num.length < 7) return num;
                return num.slice(0, 4) + "***" + num.slice(-3);
            };
            const maskedSender = maskNum(senderNum);
            const allowed = await runMiddleware(context, command);
            if (!allowed) {
                console.log(`⚠️ [COMMAND BLOCKED] .${commandName} blocked by middleware | User: ${maskedSender}`);
                continue;
            }

            const sentMsg = await command.execute(context);
            
            // 🧹 Auto-Delete Bot Message
            // 📸 Handle Auto-Delete
            const settings = getSettings();
            if (sentMsg && settings && settings.autoDelete && !command.noAutoDelete) {
                setTimeout(async () => {
                    try {
                        await sock.sendMessage(jid, { delete: sentMsg.key });
                    } catch (e) {
                        // silently fail if already deleted
                    }
                }, settings.autoDeleteTime || 30000);
            }
        } catch (err) {
            const duration = Date.now() - startTime;
            const senderNum = sender ? sender.split("@")[0] : "Unknown";
            // Mask: 2547817126867 → 2547***867
            const maskNum = (num) => {
                if (!num || num.length < 7) return num;
                return num.slice(0, 4) + "***" + num.slice(-3);
            };
            console.error(`❌ [COMMAND FAILED] .${commandName} (${duration}ms) | User: ${maskNum(senderNum)} | Error:`, err.message || err);
            try {
                await sock.sendMessage(jid, { 
                    text: `❌ *Error:* Failed to execute command \`.${commandName}\`.\n\n` +
                          `📝 *Reason:* \`${err.message}\`\n\n` +
                          `💬 _Please verify your command usage or contact the bot owner if the issue persists._`
                }, { quoted: msg });
            } catch (sendErr) {
                console.error("⚠️ Failed to send error notification to chat:", sendErr.message);
            }
        }
    }
}

module.exports = { handleMessages, commands };
