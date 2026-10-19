/**
 * Reply-safety helpers for developer commands.
 * Keeps WhatsApp messages small enough to deliver/render reliably
 * (oversized payloads can show up as "waiting for this message" on clients).
 */

// Conservative cap — well below WhatsApp's payload limits
const MAX_REPLY_CHARS = 3500;
const MAX_INPUT_CHARS = 3000;

// Strips control characters that can break message rendering on some clients
function safeText(str) {
    if (typeof str !== "string") return "";
    return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

// Cleans + clips outgoing text, adding a truncation notice
function clipText(str, max = MAX_REPLY_CHARS) {
    const clean = safeText(String(str ?? ""));
    if (clean.length <= max) return clean;
    const hidden = clean.length - max;
    return clean.slice(0, max) + `\n\n… truncated (${hidden} characters hidden — value too long for WhatsApp)`;
}

// Clips raw user input before echoing/encoding it back
function clipInput(str, max = MAX_INPUT_CHARS) {
    return safeText(String(str ?? "")).slice(0, max);
}

// True when the trimmed input exceeds the safe echo limit
function inputTooLong(str, max = MAX_INPUT_CHARS) {
    return safeText(String(str ?? "")).length > max;
}

module.exports = { safeText, clipText, clipInput, inputTooLong, MAX_REPLY_CHARS, MAX_INPUT_CHARS };