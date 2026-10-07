const { DisconnectReason } = require("@whiskeysockets/baileys");

const CATEGORIES = {
    AUTH_INVALID: "AUTH_INVALID",
    TEMPORARY: "TEMPORARY",
    RECONNECT: "RECONNECT",
    RESTART_REQUIRED: "RESTART_REQUIRED",
    UNKNOWN: "UNKNOWN"
};

const ACTIONS = {
    INVALIDATE_AUTH: "INVALIDATE_AUTH",
    RECONNECT: "RECONNECT",
    WAIT_RECONNECT: "WAIT_RECONNECT"
};

const REASON_EXPLANATIONS = {
    [DisconnectReason.badSession]: "Bad Session File — Session credentials corrupted or unparseable.",
    [DisconnectReason.connectionClosed]: "Connection Closed — WhatsApp server closed the socket stream.",
    [DisconnectReason.connectionLost]: "Connection Lost — Internet connection or socket dropped.",
    [DisconnectReason.connectionReplaced]: "Connection Replaced — Another session instance connected.",
    [DisconnectReason.loggedOut]: "Logged Out — WhatsApp account unlinked from phone.",
    [DisconnectReason.restartRequired]: "Restart Required — WhatsApp server requested connection restart.",
    [DisconnectReason.timedOut]: "Timed Out — Connection timed out due to slow network response.",
    [DisconnectReason.multideviceMismatch]: "Multi-Device Mismatch — Schema version mismatch."
};

/**
 * Classifies a Baileys disconnect event and returns recommended action.
 * NEVER deletes credentials or session files.
 * @param {object} lastDisconnect - Baileys lastDisconnect object from connection.update
 * @returns {object} - Classification result { category, action, reasonText, statusCode, errorCode, recommendedDelayMs, isTransient }
 */
function classifyDisconnect(lastDisconnect) {
    const error = lastDisconnect?.error;
    const statusCode = error?.output?.statusCode || error?.output?.payload?.statusCode;
    const errorCode = error?.code;

    // Detect network / OS socket codes (ENOTFOUND, ETIMEDOUT, ECONNRESET, etc.)
    const isNetworkCode =
        errorCode === "ENOTFOUND" ||
        errorCode === "EAI_AGAIN" ||
        errorCode === "ECONNREFUSED" ||
        errorCode === "ETIMEDOUT" ||
        errorCode === "ECONNRESET";

    let category = CATEGORIES.UNKNOWN;
    let action = ACTIONS.RECONNECT;
    let recommendedDelayMs = 5000;
    let isTransient = false;

    if (statusCode === DisconnectReason.loggedOut) {
        category = CATEGORIES.AUTH_INVALID;
        action = ACTIONS.INVALIDATE_AUTH;
        recommendedDelayMs = 5000;
        isTransient = false;
    } else if (statusCode === DisconnectReason.badSession) {
        category = CATEGORIES.AUTH_INVALID;
        action = ACTIONS.INVALIDATE_AUTH;
        recommendedDelayMs = 5000;
        isTransient = false;
    } else if (statusCode === DisconnectReason.restartRequired) {
        category = CATEGORIES.RESTART_REQUIRED;
        action = ACTIONS.RECONNECT;
        recommendedDelayMs = 2000;
        isTransient = true;
    } else if (statusCode === DisconnectReason.connectionClosed) {
        category = CATEGORIES.RECONNECT;
        action = ACTIONS.RECONNECT;
        recommendedDelayMs = 3000;
        isTransient = true;
    } else if (statusCode === DisconnectReason.connectionLost || statusCode === DisconnectReason.timedOut) {
        category = CATEGORIES.TEMPORARY;
        action = ACTIONS.WAIT_RECONNECT;
        recommendedDelayMs = 5000;
        isTransient = true;
    } else if (statusCode === DisconnectReason.connectionReplaced) {
        category = CATEGORIES.TEMPORARY;
        action = ACTIONS.WAIT_RECONNECT;
        recommendedDelayMs = 5000;
        isTransient = true;
    } else if (statusCode === DisconnectReason.multideviceMismatch) {
        category = CATEGORIES.UNKNOWN;
        action = ACTIONS.RECONNECT;
        recommendedDelayMs = 8000;
        isTransient = true;
    } else if (isNetworkCode) {
        category = CATEGORIES.TEMPORARY;
        action = ACTIONS.WAIT_RECONNECT;
        recommendedDelayMs = 5000;
        isTransient = true;
    }

    const reasonText = REASON_EXPLANATIONS[statusCode] ||
        (isTransient ? "Network connection drop / transient stream error" : `Unexpected Disconnect (Status Code: ${statusCode || "Unknown"})`);

    return {
        category,
        action,
        reasonText,
        statusCode: statusCode || null,
        errorCode: errorCode || null,
        recommendedDelayMs,
        isTransient
    };
}

module.exports = {
    CATEGORIES,
    ACTIONS,
    classifyDisconnect
};
