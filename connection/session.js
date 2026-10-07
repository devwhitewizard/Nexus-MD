const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/**
 * Checks if a valid registered session exists in authFolder/creds.json.
 * @param {string} authFolder - Path to session folder
 * @returns {object} - { exists: boolean, meId: string|null }
 */
function checkExistingSession(authFolder) {
    const credsPath = path.join(authFolder, "creds.json");
    if (!fs.existsSync(credsPath)) {
        return { exists: false, meId: null };
    }

    try {
        const rawCreds = fs.readFileSync(credsPath, "utf-8");
        const parsed = JSON.parse(rawCreds);
        if (parsed && parsed.registered && (parsed.noiseKey || parsed.me)) {
            const meId = parsed.me?.id || null;
            return { exists: true, meId };
        }
    } catch (e) {
        console.log("⚠️ [SESSION] Existing creds.json is corrupted or invalid.");
    }
    return { exists: false, meId: null };
}

/**
 * Decodes base64 / zlib SESSION_ID into valid creds object.
 * Never logs raw SESSION_ID string.
 * @param {string} rawSessionId - Base64 encoded session string configuration
 * @returns {object|null} - Decoded creds object or null
 */
function parseSessionId(rawSessionId) {
    if (!rawSessionId || typeof rawSessionId !== "string") return null;

    let rawId = rawSessionId.trim().replace(/^["']|["']$/g, "").trim();
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
        return null;
    }

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
            const parsed = JSON.parse(finalJson);
            const creds = parsed.creds || (parsed.noiseKey ? parsed : null);
            if (creds) {
                creds.registered = true;
                return creds;
            }
        }
    } catch (e) {
        console.error("❌ [SESSION] Failed to parse SESSION_ID payload:", e.message);
    }
    return null;
}

/**
 * Bootstraps credentials from SESSION_ID only when required.
 * Existing valid credentials on disk always take priority.
 * @param {string} authFolder - Session directory path
 * @returns {boolean} - True if valid credentials exist or were successfully bootstrapped
 */
function bootstrapSession(authFolder) {
    const existing = checkExistingSession(authFolder);

    if (existing.exists) {
        console.log(`📦 [SESSION] Found valid registered credentials in ${authFolder}/creds.json (Account: ${existing.meId || "Registered"}). Skipping SESSION_ID bootstrap.`);
        return true;
    }

    console.log("ℹ️ [SESSION] No valid registered credentials found on disk.");

    if (!process.env.SESSION_ID) {
        console.log("ℹ️ [SESSION] No SESSION_ID configuration input provided. Proceeding to QR Code / Pairing Code login.");
        return false;
    }

    console.log("📦 [SESSION] Bootstrapping credentials from SESSION_ID configuration input...");
    const creds = parseSessionId(process.env.SESSION_ID);

    if (creds) {
        try {
            const credsPath = path.join(authFolder, "creds.json");
            if (!fs.existsSync(path.dirname(credsPath))) {
                fs.mkdirSync(path.dirname(credsPath), { recursive: true });
            }
            fs.writeFileSync(credsPath, JSON.stringify(creds));
            console.log(`✅ [SESSION] Credentials successfully bootstrapped to: ${credsPath}`);
            return true;
        } catch (e) {
            console.error("❌ [SESSION] Failed to write bootstrapped creds.json:", e.message);
        }
    } else {
        console.error("❌ [SESSION] SESSION_ID configuration input is invalid, placeholder, or corrupted.");
    }

    return false;
}

/**
 * Resolves SESSION_ID from alternate config sources into process.env.
 * Falls back to settings file / global.session when process.env.SESSION_ID
 * is absent, so that Heroku / panel-configured session names are honoured.
 * Never overwrites SESSION_ID if it is already set or has been invalidated.
 *
 * Call once per boot, before initAuthState().
 */
function resolveSessionId() {
    if (process.env.SESSION_ID || process.env.SESSION_ID_INVALID) return;

    try {
        // Accept session token from root settings.js / config.js wrappers
        const rootSettings = require("../settings");
        const candidate = rootSettings.SESSION_ID ||
                          rootSettings.sessionName ||
                          rootSettings.session ||
                          global.session;
        if (candidate && typeof candidate === "string" && candidate.trim()) {
            process.env.SESSION_ID = candidate.trim();
            console.log("ℹ️ [SESSION] SESSION_ID resolved from settings configuration.");
        }
    } catch (e) {
        // settings.js may not exist in all environments — non-fatal
    }
}

/**
 * Clears SESSION_ID lifecycle flags from process.env.
 * Called when a fresh connection succeeds so stale failure/invalid
 * markers do not suppress QR or pairing flows on the next boot.
 */
function clearSessionFlags() {
    delete process.env.SESSION_ID_FAILED;
    delete process.env.SESSION_ID_INVALID;
}

module.exports = {
    checkExistingSession,
    parseSessionId,
    bootstrapSession,
    resolveSessionId,
    clearSessionFlags
};
