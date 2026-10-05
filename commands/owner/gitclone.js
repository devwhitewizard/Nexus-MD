const { spawn } = require('child_process');
const path = require('path');

module.exports = {
    name: "gitclone",
    aliases: ["clone", "gc"],
    description: "Clone a GitHub/Git repository to the bot's directory.",
    category: "owner",
    isOwnerOnly: true,
    cooldown: 30000,
    async execute({ sock, jid, args, msg }) {
        const repoUrl = args[0];
        const customDir = args[1]; // optional folder name

        if (!repoUrl) {
            return await sock.sendMessage(jid, {
                text: `📦 *Git Clone Command*\n\n*Usage:* \`.gitclone <repo_url> [folder_name]\`\n\n*Examples:*\n\`.gitclone https://github.com/user/repo\`\n\`.gitclone https://github.com/user/repo my-folder\`\n\n_Only GitHub and public Git URLs are supported._`
            }, { quoted: msg });
        }

        // Basic URL validation
        if (!repoUrl.startsWith('http://') && !repoUrl.startsWith('https://') && !repoUrl.startsWith('git@')) {
            return await sock.sendMessage(jid, {
                text: `❌ *Invalid URL.*\nMust start with \`https://\`, \`http://\`, or \`git@\``
            }, { quoted: msg });
        }

        // Derive the folder name
        const folderName = customDir || path.basename(repoUrl.replace(/\.git$/, ''));

        // Send initial status
        const waitMsg = await sock.sendMessage(jid, {
            text: `⏳ *Cloning repository...*\n\n🔗 *URL:* ${repoUrl}\n📁 *Folder:* \`${folderName}\`\n\n_Please wait..._`
        }, { quoted: msg });

        const cloneArgs = ['clone', repoUrl];
        if (customDir) cloneArgs.push(customDir);

        // Run git clone
        let output = '';
        let errOutput = '';

        const gitProcess = spawn('git', cloneArgs, {
            cwd: process.cwd(),
            shell: true
        });

        gitProcess.stdout.on('data', data => { output += data.toString(); });
        gitProcess.stderr.on('data', data => { errOutput += data.toString(); }); // git uses stderr for progress too

        gitProcess.on('close', async (code) => {
            // git clone progress goes to stderr even on success — combine both
            const fullOutput = (output + errOutput).trim();
            const lines = fullOutput.split('\n').filter(Boolean);
            const preview = lines.slice(-6).join('\n'); // last 6 lines

            if (code === 0) {
                await sock.sendMessage(jid, {
                    text: `✅ *Clone Successful!*\n\n📁 *Folder:* \`${folderName}\`\n📍 *Location:* \`${process.cwd()}/${folderName}\`\n\n\`\`\`\n${preview || 'Done.'}\n\`\`\``
                }, { quoted: msg });
            } else {
                // Extract meaningful error
                const errorLine = lines.find(l =>
                    l.toLowerCase().includes('error') ||
                    l.toLowerCase().includes('fatal') ||
                    l.toLowerCase().includes('not found')
                ) || lines[lines.length - 1] || 'Unknown error';

                await sock.sendMessage(jid, {
                    text: `❌ *Clone Failed!*\n\n*Reason:* ${errorLine}\n\n\`\`\`\n${preview || errOutput.trim().slice(0, 300)}\n\`\`\``
                }, { quoted: msg });
            }
        });

        gitProcess.on('error', async (err) => {
            await sock.sendMessage(jid, {
                text: `❌ *Failed to start git:* ${err.message}\n\n_Make sure \`git\` is installed on the system._`
            }, { quoted: msg });
        });
    }
};
