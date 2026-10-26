/**
 * webtools.js — shared web/network inspection service for the WEBTOOLS category.
 *
 * One implementation for every network primitive, reused by all commands:
 *   URL validation + SSRF guard
 *   HTTP header fetch / status check / redirect tracing (body never downloaded)
 *   DNS record lookup
 *   IP / public-IP geolocation (ipwho.is — free, no API key)
 *   WHOIS via RDAP (rdap.org — free, no API key, structured JSON)
 *   TLS certificate inspection (Node tls — validation never disabled)
 *   TCP port check
 *
 * Security (public bot):
 *  - Only http/https schemed public URLs; `file:`, `ftp:`, etc. rejected.
 *  - Private/loopback/link-local/metadata addresses AND hostnames resolving to
 *    them are rejected (SSRF protection) for every outbound probe.
 *  - No subprocess is ever used; 100% Node APIs + axios (existing dep).
 *  - All network calls have hard timeouts; responses are never dumped raw.
 */

const axios = require("axios");
const dns = require("dns").promises;
const net = require("net");
const tls = require("tls");

const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 10;
const MAX_RESULT_ITEMS = 8;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus-MD-WebTools/1.0";

// ── URL / host validation + SSRF guard ───────────────────────────────────────

const BLOCKED_NAMES = ["localhost", "metadata.google.internal"];

function isPrivateIPv4(ip) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
}

function isPrivateIPv6(ip) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("fe80")) return true;  // link-local
    if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique local
    return false;
}

function isPrivateIpLiteral(host) {
    if (net.isIPv4(host)) return isPrivateIPv4(host);
    if (net.isIPv6(host)) return isPrivateIPv6(host);
    return null; // hostname, not an IP literal
}

/** Reject unsafe hostnames (localhost-like) before any DNS is done. */
function assertSafeHostname(host) {
    if (!host) throw badArg("No host provided.");
    if (host.length > 253) throw badArg("Host is too long.");
    const upper = host.toLowerCase();
    if (BLOCKED_NAMES.includes(upper)) throw unsafeErr("Private/local addresses are not allowed.");
    if (upper.endsWith(".local") || upper.endsWith(".internal") || upper.endsWith(".lan")) {
        throw unsafeErr("Private/local addresses are not allowed.");
    }
    const priv = isPrivateIpLiteral(host);
    if (priv === true) throw unsafeErr("Private/local addresses are not allowed.");
}

/**
 * Resolve a hostname and confirm EVERY answer is a public IP (SSRF guard).
 * Returns the hostname unchanged on success.
 */
async function assertPublicHost(host) {
    assertSafeHostname(host);

    // IP literal — already checked by assertSafeHostname
    if (net.isIP(host)) return host;

    let answers;
    try {
        answers = net.isIPv6(host) ? await dns.resolve6(host) : await dns.resolve4(host);
    } catch (e) {
        if (e && e.code === "ENOTFOUND") throw offlineErr(`Could not resolve \`${host}\`.`);
        if (e && e.code === "ETIMEDOUT") throw timeoutErr();
        throw offlineErr(`DNS lookup failed for \`${host}\`.`);
    }

    if (!answers.length) throw offlineErr(`Could not resolve \`${host}\`.`);
    for (const ip of answers) {
        if (isPrivateIPv4(ip) || isPrivateIPv6(ip)) {
            throw unsafeErr("That host resolves to a private/local address.");
        }
    }
    return host;
}

/**
 * Parse a user-supplied URL into a safe http/https URL for outbound probing.
 * Stops: file:/ftp: etc., credentials in URL, non-80/443 ports, private hosts.
 */
async function parseWebUrl(raw, { requireProtocol = true } = {}) {
    if (typeof raw !== "string" || raw.length > 2048) throw badArg("URL is too long or missing.");
    let url;
    try {
        url = new URL(raw.startsWith("http") ? raw : (requireProtocol ? "" : "") + raw);
    } catch (e) {
        throw badArg("Invalid URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw unsafeErr("Only http:// and https:// URLs are allowed.");
    }
    if (url.username || url.password) throw unsafeErr("Credentials in the URL are not allowed.");
    const port = url.port ? Number(url.port) : 0;
    if (port && port !== 80 && port !== 443) throw unsafeErr("Only standard ports (80/443) are allowed.");
    await assertPublicHost(url.hostname.toLowerCase());
    return url;
}

/** Clean a user-supplied domain name (accepts naked domains, strips URLs). */
function parseDomain(raw) {
    if (typeof raw !== "string" || raw.length > 253) throw badArg("Missing or invalid domain.");
    let host = raw.trim().replace(/^[a-zA-Z]+:\/\//, "").split("/")[0].split(":")[0].trim();
    if (!host) throw badArg("Missing or invalid domain.");
    assertSafeHostname(host);
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^xn--[a-z0-9-]+$/.test(host)) {
        throw badArg(`\`${host}\` does not look like a valid domain.`);
    }
    return host;
}

/** Clean a user-supplied host (domain or IPv4/IPv6 literal). */
function parseHost(raw) {
    const input = (typeof raw === "string" ? raw.trim() : "");
    if (!input || input.length > 253) throw badArg("Missing or invalid host.");
    let host = net.isIPv6(input) ? input : input.replace(/^[a-zA-Z]+:\/\//, "").split("/")[0].split(":")[0].trim();
    if (!host) throw badArg("Missing or invalid host.");
    assertSafeHostname(host);
    return host;
}

// ── Errors ──────────────────────────────────────────────────────────────────

function badArg(msg) { const e = new Error(msg); e.safe = true; return e; }
function unsafeErr(msg) { const e = new Error(msg); e.safe = true; return e; }
function timeoutErr(msg = "Request timed out.") { const e = new Error(msg); e.safe = true; e.timeout = true; return e; }
function offlineErr(msg) { const e = new Error(msg); e.safe = true; return e; }

/** Map any error to a short, user-friendly message (never leaks internals). */
function friendlyError(e) {
    if (e && e.safe) return "❌ " + e.message;
    const code = (e && (e.code || (e.cause && e.cause.code))) || "";
    switch (code) {
        case "ECONNREFUSED": return "❌ Connection refused — the host rejected the connection.";
        case "ECONNRESET": return "❌ Connection was reset by the host.";
        case "ENOTFOUND": return "❌ Host not found (DNS failure).";
        case "EAI_AGAIN": return "❌ DNS lookup timed out.";
        case "EACCES": case "EADDRNOTAVAIL": return "❌ Network access denied by the server environment.";
        case "EHOSTUNREACH": case "ENETUNREACH": return "❌ Host or network is unreachable.";
        case "ETIMEDOUT": return "❌ Connection timed out.";
        case "CERT_HAS_EXPIRED": return "❌ The SSL certificate has expired.";
        case "ERR_TLS_CERT_ALTNAME_INVALID": return "❌ SSL certificate hostname mismatch.";
        default: break;
    }
    const msg = (e && e.message) || "";
    if (/timeout/i.test(msg)) return "❌ Request timed out.";
    if (/redirect/i.test(msg)) return "❌ Too many redirects (possible redirect loop).";
    return "❌ Unable to connect to the requested host.\n" +
        "Possible causes:\n• Host is offline\n• DNS failure\n• Connection timeout\n• Server rejected the connection";
}

// ── HTTP probes (body never consumed) ───────────────────────────────────────

const HTTP_OPTS = {
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
    maxRedirects: 0,
    headers: { "User-Agent": UA, "Accept": "*/*" },
    decompress: false
};

/** One HTTP visit that returns status + headers without downloading the body. */
async function probeOnce(url, method = "GET") {
    try {
        const res = await axios({
            url,
            method,
            responseType: "stream",
            ...HTTP_OPTS
        });
        // stop the body immediately — we only want headers
        if (res.data && typeof res.data.destroy === "function") res.data.destroy();
        return { status: res.status, headers: res.headers || {}, finalUrl: url };
    } catch (e) {
        if (e && e.response && e.response.status) {
            // axios turned a redirect into an error only in some configs; normalize
            return { status: e.response.status, headers: e.response.headers || {}, finalUrl: url };
        }
        throw e;
    }
}

/** Follow an HTTP redirect chain manually (loop-safe, capped). */
async function traceRedirects(startUrl, { maxRedirects = MAX_REDIRECTS } = {}) {
    const origin = await parseWebUrl(startUrl);
    let current = origin.toString();
    const chain = [];
    const seen = new Set();

    for (let hop = 0; hop <= maxRedirects; hop++) {
        if (seen.has(current)) throw badArg("Redirect loop detected.");
        seen.add(current);

        const r = await probeOnce(current, "GET");
        chain.push({ url: current, status: r.status, location: r.headers.location || null });

        if (r.status >= 300 && r.status < 400 && r.headers.location) {
            let next;
            try { next = new URL(r.headers.location, current).toString(); }
            catch (e) { throw badArg("Invalid redirect target."); }
            // re-validate every hop for scheme + SSRF
            const parsed = await parseWebUrl(next);
            current = parsed.toString();
            continue;
        }
        return { chain, finalUrl: current, hops: chain.length - 1, status: r.status, headers: r.headers };
    }
    throw badArg("Too many redirects (possible redirect loop).");
}

/** Quick status check: final status + response time (follows redirects). */
async function checkHttpStatus(url) {
    const start = Date.now();
    const result = await traceRedirects(url, { maxRedirects: 5 });
    return {
        status: result.status,
        finalUrl: result.finalUrl,
        hops: result.hops,
        timeMs: Date.now() - start,
        server: result.headers["server"] || "",
        contentType: result.headers["content-type"] || ""
    };
}

/** Fetch HTTP response headers (HEAD, GET-fallback). */
async function fetchHeaders(url) {
    const origin = await parseWebUrl(url);
    let r;
    try {
        r = await probeOnce(origin.toString(), "HEAD");
        if (r.status >= 400) throw new Error("HEAD_HEAD_FALLBACK");
    } catch (e) {
        r = await probeOnce(origin.toString(), "GET"); // graceful HEAD fallback
    }
    return { status: r.status, headers: r.headers || {}, finalUrl: r.finalUrl };
}

// ── DNS ─────────────────────────────────────────────────────────────────────

async function dnsRecords(domain) {
    const host = parseDomain(domain);
    const res = await assertPublicHost(host).catch(() => host); // informational only

    const [a, aaaa, cname, mx, ns, txt] = await Promise.all([
        dns.resolve4(host).catch(() => []),
        dns.resolve6(host).catch(() => []),
        dns.resolveCname(host).catch(() => []),
        dns.resolveMx(host).catch(() => []),
        dns.resolveNs(host).catch(() => []),
        dns.resolveTxt(host).catch(() => [])
    ]);

    if (!a.length && !aaaa.length && !cname.length && !mx.length && !ns.length && !txt.length) {
        throw offlineErr(`No DNS records found for \`${host}\`. Is it a registered, resolving domain?`);
    }
    return {
        host,
        a: a.slice(0, MAX_RESULT_ITEMS),
        aaaa: aaaa.slice(0, MAX_RESULT_ITEMS),
        cname: cname.slice(0, MAX_RESULT_ITEMS),
        mx: mx.slice(0, MAX_RESULT_ITEMS),
        ns: ns.slice(0, MAX_RESULT_ITEMS),
        txt: txt.map(parts => parts.join(" ")).slice(0, MAX_RESULT_ITEMS)
    };
}

// ── IP lookup (ipwho.is — free, no key) ─────────────────────────────────────

function parseIp(raw) {
    const ip = (typeof raw === "string" ? raw.trim() : "");
    if (!ip || ip.length > 45) throw badArg("Missing or invalid IP address.");
    if (!net.isIPv4(ip) && !net.isIPv6(ip)) throw badArg(`\`${ip}\` is not a valid IPv4 or IPv6 address.`);
    return ip;
}

async function ipInfo(raw) {
    const ip = parseIp(raw);
    const literalPrivate = isPrivateIPv4(ip) || isPrivateIPv6(ip);
    if (literalPrivate) {
        return { ip, version: net.isIPv4(ip) ? 4 : 6, private: true };
    }

    let body;
    try {
        const res = await axios.get(`https://ipwho.is/${ip}?fields=` +
            "ip,version,country,country_code,region,region_code,city,latitude,longitude," +
            "timezone,connection,type", { timeout: TIMEOUT_MS, validateStatus: () => true });
        body = res.data || {};
    } catch (e) {
        if (e && e.code === "ECONNABORTED") throw timeoutErr("IP lookup timed out.");
        throw offlineErr("The IP information service is unreachable right now.");
    }
    if (body.success === false || !body.ip) {
        throw offlineErr(body && body.message ? "IP lookup failed: no data for that address." : "IP lookup failed.");
    }

    const tz = body.timezone || {};
    return {
        ip,
        version: body.version === "IPv6" || net.isIPv6(ip) ? 6 : 4,
        private: false,
        type: body.type || "",
        country: body.country || "",
        countryCode: body.country_code || "",
        region: body.region || "",
        city: body.city || "",
        timezone: (typeof tz === "string" ? tz : tz.id) || "",
        isp: (body.connection && body.connection.isp) || "",
        org: (body.connection && body.connection.org) || "",
        asn: (body.connection && body.connection.asn) || "",
        lat: body.latitude,
        lon: body.longitude
    };
}

// ── WHOIS via RDAP (rdap.org) ───────────────────────────────────────────────

function vcardField(vcardArray, name) {
    try {
        const entries = vcardArray && vcardArray[1];
        if (!Array.isArray(entries)) return "";
        for (const entry of entries) {
            if (Array.isArray(entry) && entry[0] === name && entry[3] !== undefined) {
                return typeof entry[3] === "object" && entry[3] !== null ? entry[3].text || "" : String(entry[3]);
            }
        }
    } catch (e) { /* ignore */ }
    return "";
}

async function whoisLookup(domain) {
    const host = parseDomain(domain);
    let data;
    try {
        const res = await axios.get(`https://rdap.org/domain/${host}`, {
            timeout: TIMEOUT_MS,
            maxRedirects: 5,
            validateStatus: () => true,
            headers: { "User-Agent": UA, "Accept": "application/rdap+json" }
        });
        if (res.status === 404) throw offlineErr(`No WHOIS registration record found for \`${host}\`.`);
        if (res.status !== 200 && res.status !== 301) throw offlineErr("The WHOIS/RDAP service did not return a usable record.");
        data = res.data;
    } catch (e) {
        if (e && e.safe) throw e;
        if (e && e.code === "ECONNABORTED") throw timeoutErr("WHOIS lookup timed out.");
        throw offlineErr("The WHOIS/RDAP service is unreachable right now.");
    }

    const registrarEntity = (data.entities || []).find(
        en => Array.isArray(en.roles) && en.roles.includes("registrar")
    );
    const registrar = registrarEntity
        ? vcardField(registrarEntity.vcardArray, "fn") || registrarEntity.handle || ""
        : "";

    const eventMap = {};
    for (const ev of (data.events || [])) {
        if (ev && ev.eventAction && ev.eventDate) eventMap[ev.eventAction] = new Date(ev.eventDate).toISOString().slice(0, 10);
    }

    return {
        domain: data.ldhName || host,
        registrar: String(registrar).slice(0, 80),
        created: eventMap["registration"] || "",
        updated: eventMap["last changed"] || eventMap["last update of RDAP database"] || "",
        expires: eventMap["expiration"] || "",
        status: Array.isArray(data.status) ? data.status.slice(0, 5) : [],
        nameservers: (data.nameservers || []).map(n => n.ldhName || n.name).filter(Boolean).slice(0, MAX_RESULT_ITEMS)
    };
}

// ── TLS certificate inspection ──────────────────────────────────────────────

/** Inspect the live certificate of host:443. TLS validation is NEVER disabled. */
function tlsInspect(host, { port = 443, timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (err, info) => {
            if (settled) return;
            settled = true;
            try { socket && socket.destroy(); } catch (e) { /* ignore */ }
            err ? reject(err) : resolve(info);
        };
        let socket = null;

        try {
            socket = tls.connect({
                host,
                port,
                servername: host,          // proper SNI — hostname mismatch stays detectable
                rejectUnauthorized: true,  // never disabled
                timeout: timeoutMs
            });
        } catch (e) { return done(e); }

        socket.setTimeout(timeoutMs);
        socket.once("secureConnect", () => {
            try {
                done(null, {
                    valid: socket.authorized,
                    protocol: socket.getProtocol(),
                    cert: socket.getPeerCertificate()
                });
            } catch (e) { done(e); }
        });
        socket.once("timeout", () => done(timeoutErr("TLS connection timed out.")));
        socket.once("error", (e) => {
            e.message = e && e.reason ? e.reason : (e.message || "TLS failure");
            done(e);
        });
    });
}

// ── TCP port check ──────────────────────────────────────────────────────────

function parsePort(raw) {
    const p = Number(String(raw || "").trim());
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw badArg("Port must be an integer between 1 and 65535.");
    return p;
}

function tcpProbe(host, port, { timeoutMs = 8000 } = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (err, info) => {
            if (settled) return;
            settled = true;
            try { socket && socket.destroy(); } catch (e) { /* ignore */ }
            err ? reject(err) : resolve(info);
        };
        let socket = null;
        const start = Date.now();
        socket = net.createConnection({ host, port });
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => done(null, { open: true, ms: Date.now() - start }));
        socket.once("timeout", () => done(null, { open: false, ms: Date.now() - start, timedOut: true }));
        socket.once("error", (e) => {
            if ((e && e.code) === "ECONNREFUSED") return done(null, { open: false, ms: Date.now() - start, refused: true });
            done(e);
        });
    });
}

// ── helpers for formatting ──────────────────────────────────────────────────

/** Shared friendly reply sender for every webtools command. */
function usageReply(sock, jid, msg, cmd, exampleArgs) {
    return sock.sendMessage(
        jid,
        { text: `❓ *Usage:* \`.${cmd} ${exampleArgs.usage}\`\n\n*Example:*\n▸ \`.${cmd} ${exampleArgs.example}\`` },
        { quoted: msg }
    );
}

module.exports = {
    TIMEOUT_MS,
    MAX_REDIRECTS,
    parseWebUrl,
    parseDomain,
    parseHost,
    parseIp,
    parsePort,
    assertPublicHost,
    isPrivateIPv4,
    isPrivateIPv6,
    friendlyError,
    traceRedirects,
    checkHttpStatus,
    fetchHeaders,
    dnsRecords,
    ipInfo,
    whoisLookup,
    vcardField,
    tlsInspect,
    tcpProbe,
    badArg,
    unsafeErr,
    timeoutErr,
    offlineErr
};
