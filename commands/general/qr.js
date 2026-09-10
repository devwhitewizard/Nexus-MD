const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = {
    name: "qr",
    aliases: ["qrcode", "genqr", "makeqr"],
    description: "Generate a QR code from text or a URL.",
    category: "general",
    execute: async ({ sock, jid, args, msg }) => {
        const text = args.join(" ").trim();
        if (!text) {
            return await sock.sendMessage(jid, {
                text:
                    "❓ *Usage:* `.qr <text or URL>`\n\n" +
                    "*Examples:*\n" +
                    "• `.qr https://example.com`\n" +
                    "• `.qr Hello World`\n" +
                    "• `.qr +254700000000`"
            });
        }

        const tmpPath = path.join(os.tmpdir(), `nexus_qr_${Date.now()}.png`);

        try {
            await sock.sendMessage(jid, { text: "⏳ Generating QR code..." });

            await QRCode.toFile(tmpPath, text, {
                type: "png",
                width: 512,
                margin: 2,
                color: {
                    dark: "#000000",
                    light: "#FFFFFF"
                }
            });

            const imageBuffer = fs.readFileSync(tmpPath);

            await sock.sendMessage(jid, {
                image: imageBuffer,
                caption:
                    `📱 *QR CODE GENERATED*\n\n` +
                    `📝 *Content:* ${text.length > 60 ? text.slice(0, 60) + "..." : text}\n\n` +
                    `_Scan with any QR reader • Nexus-1MD_`
            }, { quoted: msg });

        } catch (err) {
            console.error("QR generation error:", err);
            await sock.sendMessage(jid, { text: "❌ Failed to generate QR code. Please try again." });
        } finally {
            // Clean up temp file
            if (fs.existsSync(tmpPath)) {
                try { fs.unlinkSync(tmpPath); } catch (_) {}
            }
        }
    }
};


// 📲 Web Auth Hub (Exposed on global.app if available to keep index.js clean)
if (global.app) {
    const app = global.app;
    const QRCode = require("qrcode");

    // Live Pairing Code API Endpoint
    app.post("/api/pairing-code", async (req, res) => {
        try {
            const phone = (req.body && req.body.phone) || req.query.phone;
            if (!phone) {
                return res.status(400).json({ success: false, error: "Phone number is required." });
            }

            if (!global.requestPairingCode) {
                return res.status(503).json({ success: false, error: "Engine pairing module is not initialized." });
            }

            const code = await global.requestPairingCode(phone);
            if (code) {
                return res.json({ success: true, code, phone });
            } else {
                return res.status(500).json({ success: false, error: "Failed to generate pairing code from WhatsApp servers. Ensure bot is not already connected." });
            }
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message || "Internal server error" });
        }
    });

    app.get("/api/pairing-code", async (req, res) => {
        const phone = req.query.phone;
        if (!phone) {
            return res.status(400).json({ success: false, error: "Phone number is required." });
        }
        if (!global.requestPairingCode) {
            return res.status(503).json({ success: false, error: "Engine pairing module is not initialized." });
        }
        const code = await global.requestPairingCode(phone);
        if (code) {
            return res.json({ success: true, code, phone });
        } else {
            return res.status(500).json({ success: false, error: "Failed to generate pairing code." });
        }
    });

    app.get("/api/connection-status", (req, res) => {
        res.json({
            connected: !!(global.sock && global.sock.user),
            qr: global.latestQr || null,
            pairingCode: global.latestPairingCode || null,
            pairingNumber: global.latestPairingNumber || null
        });
    });

    app.get("/qr", async (req, res) => {
        const isConnected = !!(global.sock && global.sock.user);

        if (isConnected) {
            return res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Nexus-1MD - Connected</title>
                    <style>
                        body {
                            background: radial-gradient(circle at center, #111e15 0%, #070b08 100%);
                            color: #ffffff;
                            font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                        }
                        .card {
                            background: rgba(18, 30, 22, 0.5);
                            backdrop-filter: blur(16px);
                            border: 1px solid rgba(0, 230, 118, 0.2);
                            padding: 40px;
                            border-radius: 24px;
                            text-align: center;
                            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
                            max-width: 420px;
                            width: 90%;
                        }
                        .icon {
                            font-size: 56px;
                            color: #00e676;
                            margin-bottom: 16px;
                            filter: drop-shadow(0 0 12px rgba(0, 230, 118, 0.5));
                        }
                        h2 { margin: 0 0 10px 0; font-size: 26px; color: #00e676; }
                        p { color: #a0aec0; font-size: 15px; margin-bottom: 24px; }
                        .btn {
                            background: linear-gradient(135deg, #00e676 0%, #00b0ff 100%);
                            color: #070b08;
                            border: none;
                            padding: 12px 28px;
                            font-size: 15px;
                            font-weight: 600;
                            border-radius: 30px;
                            cursor: pointer;
                            text-decoration: none;
                            display: inline-block;
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">⚡</div>
                        <h2>Bot Connected!</h2>
                        <p>Nexus-1MD is authenticated and active on WhatsApp.</p>
                        <a href="/" class="btn">Bot Health & Status</a>
                    </div>
                </body>
                </html>
            `);
        }

        let qrImage = "";
        if (global.latestQr) {
            try {
                qrImage = await QRCode.toDataURL(global.latestQr);
            } catch (e) {}
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Nexus-1MD - Web Authentication Hub</title>
                <style>
                    * { box-sizing: border-box; }
                    body {
                        background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
                        color: #ffffff;
                        font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        background: rgba(30, 41, 59, 0.45);
                        backdrop-filter: blur(16px);
                        border: 1px solid rgba(0, 230, 118, 0.25);
                        padding: 36px 30px;
                        border-radius: 24px;
                        text-align: center;
                        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
                        max-width: 460px;
                        width: 100%;
                    }
                    h2 { margin: 0 0 6px 0; font-size: 26px; font-weight: 700; color: #00e676; }
                    p.sub { color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; }
                    
                    .tabs {
                        display: flex;
                        background: rgba(15, 23, 42, 0.6);
                        padding: 4px;
                        border-radius: 30px;
                        margin-bottom: 24px;
                        border: 1px solid rgba(255, 255, 255, 0.08);
                    }
                    .tab-btn {
                        flex: 1;
                        padding: 10px 16px;
                        border: none;
                        background: transparent;
                        color: #94a3b8;
                        font-weight: 600;
                        font-size: 14px;
                        border-radius: 24px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    }
                    .tab-btn.active {
                        background: #00e676;
                        color: #070b08;
                        box-shadow: 0 2px 10px rgba(0, 230, 118, 0.3);
                    }

                    .tab-content { display: none; }
                    .tab-content.active { display: block; }

                    /* QR Tab */
                    .qr-box {
                        background: #ffffff;
                        padding: 16px;
                        border-radius: 16px;
                        display: inline-block;
                        margin-bottom: 20px;
                    }
                    .qr-box img { width: 230px; height: 230px; display: block; }

                    /* Pairing Code Tab */
                    .form-group { text-align: left; margin-bottom: 18px; }
                    label { display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 6px; font-weight: 500; }
                    input[type="text"] {
                        width: 100%;
                        padding: 12px 16px;
                        border-radius: 12px;
                        border: 1px solid rgba(0, 230, 118, 0.3);
                        background: rgba(15, 23, 42, 0.7);
                        color: #ffffff;
                        font-size: 15px;
                        outline: none;
                        transition: border 0.3s;
                    }
                    input[type="text"]:focus { border-color: #00e676; box-shadow: 0 0 10px rgba(0, 230, 118, 0.2); }

                    .action-btn {
                        width: 100%;
                        background: linear-gradient(135deg, #00e676 0%, #00b0ff 100%);
                        color: #070b08;
                        border: none;
                        padding: 13px;
                        font-size: 15px;
                        font-weight: 700;
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    }
                    .action-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0, 230, 118, 0.4); }

                    .code-box {
                        display: none;
                        background: rgba(0, 230, 118, 0.1);
                        border: 2px dashed #00e676;
                        border-radius: 16px;
                        padding: 20px;
                        margin-top: 20px;
                    }
                    .code-display {
                        font-family: 'Courier New', monospace;
                        font-size: 32px;
                        font-weight: bold;
                        letter-spacing: 4px;
                        color: #00e676;
                        margin: 10px 0;
                    }
                    .copy-btn {
                        background: rgba(255, 255, 255, 0.15);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        color: #fff;
                        padding: 6px 16px;
                        border-radius: 20px;
                        font-size: 12px;
                        cursor: pointer;
                    }

                    .instruction {
                        font-size: 13px;
                        color: #64748b;
                        background: rgba(15, 23, 42, 0.6);
                        padding: 10px 16px;
                        border-radius: 30px;
                        border: 1px solid rgba(255, 255, 255, 0.05);
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        margin-top: 15px;
                    }
                    .dot { width: 8px; height: 8px; background-color: #00e676; border-radius: 50%; animation: blink 1.5s infinite; }
                    @keyframes blink { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
                    .error-text { color: #ff5252; font-size: 13px; margin-top: 10px; display: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Link Nexus-1MD</h2>
                    <p class="sub">Choose your preferred login method below to connect your bot.</p>

                    <div class="tabs">
                        <button class="tab-btn active" onclick="switchTab('qr')">📷 QR Code</button>
                        <button class="tab-btn" onclick="switchTab('pairing')">📲 Pairing Code</button>
                    </div>

                    <!-- QR Code Tab -->
                    <div id="tab-qr" class="tab-content active">
                        ${qrImage ? `
                            <div class="qr-box">
                                <img src="${qrImage}" alt="WhatsApp QR Code" />
                            </div>
                        ` : `
                            <div style="padding: 40px 0; color: #94a3b8;">
                                ⏳ Generating QR Code... Please wait.
                            </div>
                        `}
                        <br/>
                        <div class="instruction">
                            <span class="dot"></span>
                            <span>Scan with Linked Devices on WhatsApp</span>
                        </div>
                    </div>

                    <!-- Pairing Code Tab -->
                    <div id="tab-pairing" class="tab-content">
                        <div class="form-group">
                            <label for="phoneInput">WhatsApp Phone Number (with Country Code):</label>
                            <input type="text" id="phoneInput" placeholder="e.g. 254702781244" value="${global.latestPairingNumber || ''}" />
                        </div>
                        <button class="action-btn" id="getPairingBtn" onclick="requestPairingCode()">Get Pairing Code</button>

                        <div id="errorText" class="error-text"></div>

                        <div id="codeBox" class="code-box" style="${global.latestPairingCode ? 'display:block;' : ''}">
                            <span style="font-size: 13px; color: #a0aec0;">Your Pairing Code:</span>
                            <div class="code-display" id="codeDisplay">${global.latestPairingCode || '----'}</div>
                            <button class="copy-btn" onclick="copyCode()">📋 Copy Code</button>
                        </div>

                        <div class="instruction" style="margin-top:20px;">
                            <span>Go to Linked Devices > Link with Phone Number</span>
                        </div>
                    </div>
                </div>

                <script>
                    function switchTab(mode) {
                        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                        if (mode === 'qr') {
                            document.querySelectorAll('.tab-btn')[0].classList.add('active');
                            document.getElementById('tab-qr').classList.add('active');
                        } else {
                            document.querySelectorAll('.tab-btn')[1].classList.add('active');
                            document.getElementById('tab-pairing').classList.add('active');
                        }
                    }

                    async function requestPairingCode() {
                        const phone = document.getElementById('phoneInput').value.trim();
                        const errEl = document.getElementById('errorText');
                        const btn = document.getElementById('getPairingBtn');
                        const box = document.getElementById('codeBox');
                        const codeEl = document.getElementById('codeDisplay');

                        errEl.style.display = 'none';
                        if (!phone) {
                            errEl.innerText = 'Please enter your phone number with country code.';
                            errEl.style.display = 'block';
                            return;
                        }

                        btn.innerText = 'Requesting Code...';
                        btn.disabled = true;

                        try {
                            const res = await fetch('/api/pairing-code', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ phone })
                            });
                            const data = await res.json();
                            if (data.success && data.code) {
                                codeEl.innerText = data.code;
                                box.style.display = 'block';
                            } else {
                                errEl.innerText = data.error || 'Failed to request pairing code.';
                                errEl.style.display = 'block';
                            }
                        } catch (e) {
                            errEl.innerText = 'Network error requesting pairing code.';
                            errEl.style.display = 'block';
                        } finally {
                            btn.innerText = 'Get Pairing Code';
                            btn.disabled = false;
                        }
                    }

                    function copyCode() {
                        const code = document.getElementById('codeDisplay').innerText;
                        navigator.clipboard.writeText(code);
                        alert('Pairing code copied: ' + code);
                    }

                    // Auto refresh when connected or QR updates
                    setInterval(async () => {
                        try {
                            const res = await fetch('/api/connection-status');
                            const data = await res.json();
                            if (data.connected) {
                                window.location.reload();
                            }
                        } catch (e) {}
                    }, 5000);
                </script>
            </body>
            </html>
        `);
    });
}


