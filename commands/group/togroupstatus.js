const sharestatus = require("./sharestatus");

module.exports = {
    name: "togroupstatus",
    aliases: ["statustogroup", "status2group"],
    description: "Share or post a status update to the group chat (does not mute the group).",
    category: "group",
    cooldown: 5000,
    execute: async (ctx) => {
        return await sharestatus.execute(ctx);
    }
};

