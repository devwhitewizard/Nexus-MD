/**
 * connection/reconnect.js
 *
 * Controlled reconnect manager for WhatsApp socket lifecycle.
 *
 * Responsibilities:
 *   - Schedule and execute reconnect attempts with exponential backoff.
 *   - Guarantee at most ONE pending reconnect at any time (storm prevention).
 *   - Never touch authentication state, session files, or SESSION_ID.
 *   - Never create more than one active socket simultaneously.
 *   - Reset retry counter on confirmed successful connection.
 *   - Stop retrying when intentionally closed.
 *
 * This module does NOT:
 *   - Delete credentials or session files.
 *   - Regenerate or log SESSION_ID or any private credential.
 *   - Know anything about socket construction (delegated to caller via callback).
 */

"use strict";

// ---------------------------------------------------------------------------
// Backoff table (ms) — exact values per spec:
//   attempt 1 →  2 000 ms
//   attempt 2 →  4 000 ms
//   attempt 3 →  8 000 ms
//   attempt 4 → 16 000 ms
//   attempt 5 → 30 000 ms  (spec cap at 30s before final 60s plateau)
//   attempt 6+ → 60 000 ms (hard ceiling)
// ---------------------------------------------------------------------------
const BACKOFF_TABLE = [2000, 4000, 8000, 16000, 30000, 60000];
const MAX_DELAY_MS = 60000;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let _retryCount = 0;        // Consecutive failed attempts since last successful open
let _isPending = false;     // True when a reconnect setTimeout is queued
let _isStopped = false;     // True when stopReconnect() has been called
let _pendingTimer = null;   // Reference to the queued setTimeout handle
let _startConnection = null; // Injected callback — the only thing we call

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Registers the connection factory callback.
 * Must be called once during application startup before any reconnect can fire.
 *
 * @param {Function} startConnectionFn - Async function that creates one socket
 *   and returns when that socket's lifecycle begins. Must not return a socket;
 *   it is expected to update global state on its own (e.g. global.sock).
 */
function init(startConnectionFn) {
    if (typeof startConnectionFn !== "function") {
        throw new TypeError("[RECONNECT] init() requires a function argument.");
    }
    _startConnection = startConnectionFn;
}

/**
 * Returns the current exponential backoff delay in ms for the upcoming attempt.
 * Uses the BACKOFF_TABLE — never exceeds MAX_DELAY_MS.
 *
 * @returns {number} Delay in milliseconds
 */
function getBackoffDelay() {
    const idx = Math.min(_retryCount, BACKOFF_TABLE.length - 1);
    return BACKOFF_TABLE[idx];
}

/**
 * Schedules a single reconnect attempt.
 *
 * Rules enforced here:
 *   1. If stopped (intentional close) → do nothing.
 *   2. If a reconnect is already pending → do nothing (storm prevention).
 *   3. Compute delay from backoff table.
 *   4. Log attempt number and delay — never log credentials.
 *   5. Execute startConnection() after delay.
 *   6. On startConnection() throw, increment retry and reschedule.
 *
 * @param {number} [overrideDelayMs] - Optional delay override (e.g. from classifier).
 *   When provided it is used for this attempt only; backoff table resumes next attempt.
 */
function scheduleReconnect(overrideDelayMs) {
    if (_isStopped) {
        console.log("🛑 [RECONNECT] Reconnect suppressed — connection was intentionally stopped.");
        return;
    }

    if (_isPending) {
        console.log(`⏳ [RECONNECT] Reconnect already queued (attempt #${_retryCount + 1}). Skipping duplicate request.`);
        return;
    }

    if (!_startConnection) {
        console.error("❌ [RECONNECT] reconnect.init() was never called. Cannot reconnect.");
        return;
    }

    const delay = typeof overrideDelayMs === "number" && overrideDelayMs > 0
        ? Math.min(overrideDelayMs, MAX_DELAY_MS)
        : getBackoffDelay();

    const attemptNumber = _retryCount + 1;
    console.log(`🔄 [RECONNECT] Scheduling attempt #${attemptNumber} in ${delay / 1000}s...`);

    _isPending = true;
    _pendingTimer = setTimeout(async () => {
        _isPending = false;
        _pendingTimer = null;

        // Re-check stop flag — may have been set while timer was pending
        if (_isStopped) {
            console.log("🛑 [RECONNECT] Timer fired but stop was requested. Aborting reconnect.");
            return;
        }

        console.log(`🔌 [RECONNECT] Executing attempt #${attemptNumber}...`);

        try {
            await _startConnection();
            // startConnection() sets up event listeners; success is confirmed
            // via notifyConnected() called from "connection.update === open".
        } catch (err) {
            // startConnection() itself threw before the socket could even be created.
            _retryCount++;
            const nextDelay = getBackoffDelay();
            console.error(
                `❌ [RECONNECT] Attempt #${attemptNumber} threw an error: ${err.message}. ` +
                `Scheduling attempt #${_retryCount + 1} in ${nextDelay / 1000}s...`
            );
            scheduleReconnect(); // Recurse with incremented counter
        }
    }, delay);
}

/**
 * Called by connection/index.js when "connection.update" fires with connection === "open".
 * Resets the retry counter and clears the stopped flag so future disconnects
 * can trigger reconnect again.
 */
function notifyConnected() {
    const wasRetrying = _retryCount > 0;
    _retryCount = 0;
    _isStopped = false;
    _isPending = false;

    if (_pendingTimer) {
        clearTimeout(_pendingTimer);
        _pendingTimer = null;
    }

    if (wasRetrying) {
        console.log("✅ [RECONNECT] Connection established. Retry counter reset.");
    }
}

/**
 * Permanently stops the reconnect manager for this process lifecycle.
 * Any pending timer is cancelled. Future scheduleReconnect() calls are no-ops.
 *
 * Call this when:
 *   - AUTH_INVALID — caller will wipe session and restart fresh, not retry.
 *   - Process is intentionally shutting down.
 *
 * To resume after a stop, call resumeReconnect().
 */
function stopReconnect() {
    _isStopped = true;

    if (_pendingTimer) {
        clearTimeout(_pendingTimer);
        _pendingTimer = null;
        _isPending = false;
    }

    console.log("🛑 [RECONNECT] Reconnect manager stopped.");
}

/**
 * Resumes the reconnect manager after a stopReconnect() call.
 * Resets stop flag but preserves the current retry count.
 * Useful when restarting from AUTH_INVALID after a fresh session wipe.
 */
function resumeReconnect() {
    if (!_isStopped) return;
    _isStopped = false;
    _retryCount = 0;
    console.log("▶️ [RECONNECT] Reconnect manager resumed (retry counter reset).");
}

/**
 * Returns a read-only snapshot of the current reconnect manager state.
 * Safe to log — contains no credentials.
 *
 * @returns {{ retryCount: number, isPending: boolean, isStopped: boolean, nextDelayMs: number }}
 */
function getState() {
    return {
        retryCount: _retryCount,
        isPending: _isPending,
        isStopped: _isStopped,
        nextDelayMs: getBackoffDelay()
    };
}

module.exports = {
    init,
    scheduleReconnect,
    notifyConnected,
    stopReconnect,
    resumeReconnect,
    getState
};
