const { DisconnectReason } = require("@whiskeysockets/baileys");

const REASON_EXPLANATIONS = {
    [DisconnectReason.badSession]: "Bad Session File — Credentials corrupted, wiping and restarting connection...",
    [DisconnectReason.connectionClosed]: "Connection Closed — WhatsApp server closed the socket, reconnecting...",
    [DisconnectReason.connectionLost]: "Connection Lost — Internet connection or socket drop, reconnecting...",
    [DisconnectReason.connectionReplaced]: "Connection Replaced — Another session logged in with this phone number.",
    [DisconnectReason.loggedOut]: "Logged Out — Bot unlinked or logged out from phone. Scan QR code or pairing code to re-link.",
    [DisconnectReason.restartRequired]: "Restart Required — WhatsApp server requested restart, reconnecting...",
    [DisconnectReason.timedOut]: "Timed Out — Connection timed out (poor server connection), reconnecting...",
    [DisconnectReason.multideviceMismatch]: "Multi-Device Mismatch — Please re-pair your WhatsApp device."
};

/**
 * Categorizes disconnect error into transient (network drop) vs non-transient (session failure).
 * @param {object} lastDisconnect - Baileys lastDisconnect object
 * @returns {boolean} - True if error is transient network drop
 */
function isTransientNetworkError(lastDisconnect) {
    const error = lastDisconnect?.error;
    const statusCode = error?.output?.statusCode || error?.output?.payload?.statusCode;

    const isNetworkCode =
        error?.code === "ENOTFOUND" ||
        error?.code === "EAI_AGAIN" ||
        error?.code === "ECONNREFUSED" ||
        error?.code === "ETIMEDOUT" ||
        error?.code === "ECONNRESET";

    const isTransientStatus =
        statusCode === DisconnectReason.connectionLost ||
        statusCode === DisconnectReason.connectionClosed ||
        statusCode === DisconnectReason.timedOut ||
        statusCode === DisconnectReason.restartRequired;

    return isNetworkCode || isTransientStatus;
}

/**
 * Gets human readable explanation for status code.
 * @param {number} statusCode - Baileys disconnect status code
 * @returns {string} - Explanation text
 */
function getDisconnectReasonText(statusCode) {
    return REASON_EXPLANATIONS[statusCode] || `Unexpected Disconnect (Status Code: ${statusCode || "Unknown"})`;
}

/**
 * Starts an active watchdog interval to monitor socket responsiveness.
 * @param {object} sock - Baileys WASocket instance
 * @param {function} onFailure - Callback executed when socket healthcheck fails
 * @param {number} intervalMs - Check frequency in ms (default: 3 mins)
 */
function startWatchdog(sock, onFailure, intervalMs = 3 * 60 * 1000) {
    if (global.healthCheckInterval) {
        clearInterval(global.healthCheckInterval);
    }

    global.healthCheckInterval = setInterval(async () => {
        try {
            const wsOpen = sock && sock.ws && (
                sock.ws.isOpen === true ||
                sock.ws.readyState === 1 ||
                (sock.ws.socket && sock.ws.socket.readyState === 1)
            );

            if (wsOpen) {
                await Promise.race([
                    sock.fetchBlocklist().catch(() => null),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Socket query timeout")), 15000))
                ]);
            } else {
                throw new Error("WebSocket not open");
            }
        } catch (err) {
            console.error("⚠️ [WATCHDOG] Active connection health check failed:", err.message);
            clearInterval(global.healthCheckInterval);
            if (typeof onFailure === "function") onFailure(err);
        }
    }, intervalMs);

    return global.healthCheckInterval;
}

/**
 * Stops the active connection watchdog interval.
 */
function stopWatchdog() {
    if (global.healthCheckInterval) {
        clearInterval(global.healthCheckInterval);
        global.healthCheckInterval = null;
    }
}

/**
 * Calculates exponential reconnect backoff delay in ms based on failure count.
 * @param {number} failureCount - Consecutive failure count
 * @param {number} baseDelay - Base delay in ms
 * @returns {number} - Calculated delay in ms
 */
function calculateReconnectDelay(failureCount = 0, baseDelay = 2000) {
    const exp = Math.min(failureCount, 5);
    const delay = baseDelay * Math.pow(2, exp);
    return Math.min(delay, 30000); // Cap max delay at 30 seconds
}

module.exports = {
    isTransientNetworkError,
    getDisconnectReasonText,
    startWatchdog,
    stopWatchdog,
    calculateReconnectDelay
};
