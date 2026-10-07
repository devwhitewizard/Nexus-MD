/**
 * index.js — Application Bootstrap
 *
 * Responsibilities (this file only):
 *   1. Load environment variables (.env / config.env).
 *   2. Install the log-noise filter for Baileys/libsignal internals.
 *   3. Register global exception handlers to prevent crash on non-fatal errors.
 *   4. Start the Express health/admin server.
 *   5. Delegate ALL WhatsApp connection lifecycle to connection/index.js.
 *
 * This file does NOT:
 *   - Manage auth, session files, or SESSION_ID.
 *   - Create or manage sockets.
 *   - Handle reconnect or disconnect logic.
 *   - Execute commands or touch commandHandler.
 *   - Access database models directly.
 */

"use strict";

const path = require("path");
const fs = require("fs");

// ── 1. Environment Variables ─────────────────────────────────────────────────
const envPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "config.env");

const envResult = require("dotenv").config({ path: envPath });
if (envResult.error) {
    console.log("⚠️  Could not find environment file (.env / config.env). Using system environment variables instead.");
} else {
    console.log(`✅ ${path.basename(envPath)} file loaded successfully.`);
}

// ── 2. Log Noise Filter ──────────────────────────────────────────────────────
// Maps known noisy libsignal/Baileys internals to clean human-readable messages.
// Each unique message is rate-limited to once per 30s to prevent spam.
const _origError = console.error.bind(console);
const _origLog   = console.log.bind(console);

const CLEAN_SIGNAL_ERRORS = [
    // Pattern → clean message (shown max once per 30s)
    { match: "Bad MAC",                                          msg: "⚠️  [Signal] Corrupt session key (Bad MAC) — key will auto-refresh on next message." },
    { match: "No matching sessions found",                       msg: "⚠️  [Signal] No session found for this contact — awaiting fresh key exchange." },
    { match: "No session found to decrypt",                      msg: "⚠️  [Signal] Missing sender key — message skipped, will resolve automatically." },
    { match: "Failed to decrypt message with any known session", msg: "⚠️  [Signal] All session keys failed — contact needs to send a new message to re-establish." },
    { match: "Closing open session in favor of incoming prekey", msg: "ℹ️  [Signal] Re-keying session (prekey bundle received)." },
    { match: "Closing session:",                                 msg: "ℹ️  [Signal] Closing stale session." },
    { match: "Decrypted message with closed session",            msg: "ℹ️  [Signal] Decrypted via closed session (harmless)." },
    { match: "transaction failed, rolling back",                 msg: "⚠️  [Signal] Transaction rollback — likely due to session mismatch (non-fatal)." },
    // Raw session object dumps — suppress entirely
    { match: "_chains",          msg: null },
    { match: "registrationId",   msg: null },
    { match: "currentRatchet",   msg: null },
    { match: "pendingPreKey",    msg: null },
    { match: "indexInfo",        msg: null },
    { match: "baseKeyType",      msg: null },
    { match: "ephemeralKeyPair", msg: null },
];

const _logCooldowns = new Map(); // match key → last printed timestamp
const COOLDOWN_MS = 30_000;      // show each unique clean message max once per 30s

function interceptLog(originalFn, args) {
    const raw = String(args[0] ?? "");
    for (const { match, msg } of CLEAN_SIGNAL_ERRORS) {
        if (raw.includes(match)) {
            if (msg === null) return; // silently drop raw dumps
            const now = Date.now();
            const last = _logCooldowns.get(match) || 0;
            if (now - last >= COOLDOWN_MS) {
                _logCooldowns.set(match, now);
                _origLog(msg);
            }
            return;
        }
    }
    originalFn(...args);
}

console.error = (...args) => interceptLog(_origError, args);
console.log   = (...args) => interceptLog(_origLog,   args);

// ── 3. Global Exception Handlers ─────────────────────────────────────────────
// Prevent process crash on Baileys/libsignal non-fatal async errors.
process.on("unhandledRejection", (reason) => {
    _origError("⚠️ Unhandled Promise Rejection:", reason);
});
process.on("uncaughtException", (error) => {
    _origError("⚠️ Uncaught Exception:", error);
});

// ── 4. Express Application Server ────────────────────────────────────────────
const express = require("express");
const app = express();
global.app = app;
const PORT = process.env.PORT || 3000;

// Health check root endpoint
app.get("/", (req, res) => {
    const { getSettings } = require("./lib/settings");
    const settings = getSettings();
    const botName = settings.botName || "Nexus-MD";
    res.send(`🤖 ${botName} is Online and Healthy!`);
});

// Admin Control Panel API routes (/qr, /status, /api/*)
try {
    const { initAdminApi } = require("./lib/adminApi");
    initAdminApi(app);
} catch (e) {
    console.error("⚠️ Failed to load Admin API router:", e.message);
}

app.listen(PORT, () => {
    console.log(`🌍 Heartbeat server listening on port ${PORT}`);
    console.log(`👉 If the terminal QR code is too big or hard to scan, open http://localhost:${PORT}/qr in your web browser!\n`);
});

// ── 5. WhatsApp Connection — Single Lifecycle Owner ──────────────────────────
// All auth, session, socket, disconnect, and reconnect logic lives in connection/.
// This is the only place startConnection() is called from application code.
const { startConnection } = require("./connection");
startConnection();