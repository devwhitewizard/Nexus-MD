const { BufferJSON, initAuthCreds, proto } = require("@whiskeysockets/baileys");
const { DataTypes } = require("sequelize");
const { sequelize, isOnline } = require("./db");

let BaileysAuth = null;

if (sequelize) {
    BaileysAuth = sequelize.define("BaileysAuth", {
        keyId: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        value: {
            type: DataTypes.TEXT,
        }
    }, {
        tableName: "baileys_auths",
        timestamps: true,
    });
}

/**
 * Custom database-backed state provider for Baileys.
 * Saves credentials, prekeys, sessions, and sender keys directly to SQLite or Postgres database.
 *
 * This is a pure DB provider — it does NOT fall back to filesystem auth.
 * The caller (connection/auth.js) is responsible for fallback logic.
 *
 * Returns null if the database is unavailable, allowing the caller to fall back.
 *
 * @param {string} sessionName - Unique namespace prefix for the keys
 * @returns {Promise<object|null>} - Baileys auth state object, or null if DB unavailable
 */
async function useDatabaseAuthState(sessionName = "session") {
    if (!BaileysAuth || !isOnline()) {
        return null;
    }

    // Sync table schema first to ensure the table exists
    try {
        await BaileysAuth.sync();
    } catch (e) {
        console.error("❌ Failed to synchronize BaileysAuth schema:", e.message);
        return null;
    }

    const writeData = async (data, keyId) => {
        try {
            const valueStr = JSON.stringify(data, BufferJSON.replacer);
            await BaileysAuth.upsert({ keyId, value: valueStr });
        } catch (e) {
            console.error("❌ Failed to write auth key to DB:", e.message);
        }
    };

    const readData = async (keyId) => {
        try {
            const record = await BaileysAuth.findByPk(keyId);
            if (!record) return null;
            return JSON.parse(record.value, BufferJSON.reviver);
        } catch (e) {
            console.error("❌ Failed to read auth key from DB:", e.message);
            return null;
        }
    };

    const removeData = async (keyId) => {
        try {
            await BaileysAuth.destroy({ where: { keyId } });
        } catch (e) {
            console.error("❌ Failed to remove auth key from DB:", e.message);
        }
    };

    // Load or initialize creds
    const credsKey = `${sessionName}_creds`;
    let creds = await readData(credsKey);
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, credsKey);
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        const keyId = `${sessionName}_${type}_${id}`;
                        let value = await readData(keyId);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const keyId = `${sessionName}_${category}_${id}`;
                            tasks.push(value ? writeData(value, keyId) : removeData(keyId));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData(creds, credsKey);
        }
    };
}

module.exports = { useDatabaseAuthState };
