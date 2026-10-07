const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

/**
 * Auto-syncs live valid credentials to .env so SESSION_ID is never stale.
 * @param {string} authFolder - Path to session folder
 */
function syncSessionIdToEnv(authFolder) {
    try {
        const credsPath = path.join(authFolder, "creds.json");
        if (!fs.existsSync(credsPath)) return;
        const credsRaw = fs.readFileSync(credsPath, "utf-8");
        const credsObj = JSON.parse(credsRaw);
        if (!credsObj || !credsObj.registered) return;

        const base64Session = "Nexus~" + Buffer.from(credsRaw, "utf-8").toString("base64");
        process.env.SESSION_ID = base64Session;

        const envFile = fs.existsSync(path.join(process.cwd(), ".env"))
            ? path.join(process.cwd(), ".env")
            : (fs.existsSync(path.join(process.cwd(), "config.env")) ? path.join(process.cwd(), "config.env") : null);

        if (envFile) {
            let envContent = fs.readFileSync(envFile, "utf-8");
            if (envContent.includes("SESSION_ID=")) {
                envContent = envContent.replace(/SESSION_ID=.*/g, `SESSION_ID=${base64Session}`);
            } else {
                envContent += `\nSESSION_ID=${base64Session}\n`;
            }
            fs.writeFileSync(envFile, envContent, "utf-8");
            console.log("🔄 [AUTH] Auto-synced active live session credentials to .env file!");
        }
    } catch (e) {
        console.error("⚠️ [AUTH] Failed to auto-sync SESSION_ID to .env:", e.message);
    }
}

/**
 * Restores creds.json from base64 SESSION_ID environment variable.
 * @param {string} authFolder - Target directory to write creds.json
 */
function restoreSessionFromEnv(authFolder) {
    if (process.env.SESSION_ID_INVALID === "true" || !process.env.SESSION_ID) return false;

    let rawId = process.env.SESSION_ID.trim().replace(/^["']|["']$/g, "").trim();
    if (rawId.includes("SESSION_ID=")) {
        rawId = rawId.split("SESSION_ID=")[1].trim();
    }

    let sessionId = rawId;
    if (rawId.includes("~")) {
        sessionId = rawId.split("~").slice(1).join("~");
    } else if (/^nexus[-_~]?/i.test(rawId)) {
        sessionId = rawId.replace(/^nexus[-_~]?/i, "");
    }
    sessionId = sessionId.replace(/\s+/g, "");

    const DUMMY_VALUES = ["none", "null", "undefined", "session_id_here", "your_session_id", "nexus~", "false", "0", "optional", "empty"];
    const EXACT_PLACEHOLDER_IDS = [
        "eyJub2lzZUtleSI6eyJwcml2YXRlIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiU0pUV0VlblZHNE55eElrT1ROaXBNR0x5SlI1ZWwxemFIYzJJWUprbUNicFU9In0s"
    ];

    if (!sessionId || sessionId.length < 20 || DUMMY_VALUES.includes(sessionId.toLowerCase()) || EXACT_PLACEHOLDER_IDS.includes(sessionId)) {
        console.log("ℹ️ [AUTH] Placeholder or invalid SESSION_ID detected. Allowing QR/Pairing mode.");
        delete process.env.SESSION_ID;
        return false;
    }

    console.log("📦 [AUTH] Initializing credentials from SESSION_ID environment variable...");
    try {
        let safeBase64 = sessionId.replace(/-/g, "+").replace(/_/g, "/");
        while (safeBase64.length % 4 !== 0) safeBase64 += "=";

        const buffer = Buffer.from(safeBase64, "base64");

        const decodeBuffer = (buf) => {
            try { return zlib.gunzipSync(buf).toString("utf-8"); } catch {
                try { return zlib.inflateSync(buf).toString("utf-8"); } catch {
                    return buf.toString("utf-8");
                }
            }
        };

        let credsJson = decodeBuffer(buffer);
        if (!credsJson.includes("{") && /^[a-zA-Z0-9+/=]+$/.test(credsJson.trim())) {
            const nestedBuffer = Buffer.from(credsJson.trim(), "base64");
            credsJson = decodeBuffer(nestedBuffer);
        }

        const extractValidJsonFromBuffer = (buf) => {
            const text = buf.toString("utf-8");
            const firstBrace = text.indexOf("{");
            if (firstBrace === -1) return null;

            for (let i = 0; i < text.length; i++) {
                if (text[i] === "{") {
                    try {
                        const candidate = text.substring(i, text.lastIndexOf("}") + 1);
                        if (candidate.includes("noiseKey") || candidate.includes("creds")) {
                            JSON.parse(candidate);
                            return candidate;
                        }
                    } catch (e) { }
                }
            }
            return null;
        };

        const finalJson = extractValidJsonFromBuffer(Buffer.from(credsJson)) || extractValidJsonFromBuffer(buffer);

        if (finalJson) {
            let parsed = JSON.parse(finalJson);
            let creds = parsed.creds || (parsed.noiseKey ? parsed : null);

            if (creds) {
                creds.registered = true;
                const finalPath = path.join(authFolder, "creds.json");
                if (!fs.existsSync(path.dirname(finalPath))) fs.mkdirSync(path.dirname(finalPath), { recursive: true });
                fs.writeFileSync(finalPath, JSON.stringify(creds));
                console.log(`✅ [AUTH] Session credentials successfully synced to: ${finalPath}`);
                return true;
            }
        }
        console.error("❌ [AUTH] Could not extract valid credentials JSON from SESSION_ID.");
        delete process.env.SESSION_ID;
        return false;
    } catch (e) {
        console.error("❌ [AUTH] Failed to restore session from SESSION_ID:", e.message);
        delete process.env.SESSION_ID;
        return false;
    }
}

const { bootstrapSession } = require("./session");

/**
 * Initializes authentication state.
 * This is the single authoritative entry point for choosing the auth backend.
 *
 * Backend selection order:
 *   1. If AUTH_MODE=db → use DB-backed auth (dbAuth.js)
 *   2. Otherwise → use filesystem auth (useMultiFileAuthState)
 *
 * DB auth is ONLY activated by the explicit AUTH_MODE=db opt-in.
 * DATABASE_URL alone does NOT enable DB-backed Baileys auth — it is the
 * bot's normal application database and has no effect on auth backend selection.
 *
 * @param {string} authFolder - Directory for session files
 */
async function initAuthState(authFolder) {
    // Bootstrap credentials from SESSION_ID if no valid on-disk session exists
    bootstrapSession(authFolder);

    // Attempt DB-backed auth ONLY when explicitly requested via AUTH_MODE=db
    const authMode = (process.env.AUTH_MODE || "").trim().toLowerCase();
    if (authMode === "db") {
        try {
            const { useDatabaseAuthState } = require("../nexus/dbAuth");
            const dbAuth = await useDatabaseAuthState(authFolder);
            if (dbAuth) {
                console.log("💾 [AUTH] AUTH_MODE=db — using database-backed authentication.");
                return {
                    state: dbAuth.state,
                    saveCreds: dbAuth.saveCreds,
                    syncSessionIdToEnv: () => syncSessionIdToEnv(authFolder)
                };
            }
            // AUTH_MODE=db was explicitly requested but DB auth is unavailable.
            // Fail clearly rather than silently falling back to filesystem.
            throw new Error(
                "AUTH_MODE=db is set but database-backed auth is unavailable. " +
                "Ensure DATABASE_URL is configured and the database is reachable. " +
                "Remove AUTH_MODE=db to use filesystem auth."
            );
        } catch (e) {
            console.error("❌ [AUTH] Database auth initialization failed:", e.message);
            throw e;
        }
    }

    // Filesystem auth (default when AUTH_MODE is absent, empty, or not "db")
    let { state, saveCreds } = await useMultiFileAuthState(authFolder);

    return {
        state,
        saveCreds,
        syncSessionIdToEnv: () => syncSessionIdToEnv(authFolder)
    };
}

/**
 * Completely wipes local session credentials.
 * @param {string} authFolder - Path to session folder
 */
function wipeSessionFolder(authFolder) {
    try {
        const credsPath = path.join(authFolder, "creds.json");
        if (fs.existsSync(credsPath)) fs.unlinkSync(credsPath);

        if (fs.existsSync(authFolder)) {
            fs.readdirSync(authFolder).forEach(file => {
                try { fs.unlinkSync(path.join(authFolder, file)); } catch (e) { }
            });
        }
        console.log("🧹 [AUTH] Local session folder wiped successfully.");
    } catch (e) {
        console.error("❌ [AUTH] Failed to wipe session directory:", e.message);
    }
}

/**
 * Generates a Nexus~ session ID from the credentials in the given authFolder.
 * Returns both the session ID string and the raw creds Buffer for backup purposes.
 * Never logs credentials or the actual SESSION_ID.
 * @param {string} authFolder - Path to session folder
 * @returns {{ sessionId: string, credsBuffer: Buffer }|null}
 */
function generateSessionId(authFolder) {
    try {
        const credsPath = path.join(authFolder, "creds.json");
        if (!fs.existsSync(credsPath)) return null;

        const credsBuffer = fs.readFileSync(credsPath);
        const sessionId = "Nexus~" + credsBuffer.toString("base64");

        return { sessionId, credsBuffer };
    } catch (e) {
        console.error("⚠️ [AUTH] Failed to generate session ID:", e.message);
        return null;
    }
}

module.exports = {
    initAuthState,
    syncSessionIdToEnv,
    restoreSessionFromEnv,
    wipeSessionFolder,
    generateSessionId
};
