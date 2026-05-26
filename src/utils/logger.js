// ============================================
// 🏟️ OPEN ARENA - Logger Utility
// Centralized logging system
// ============================================

const log = {
    info: (msg, ...meta) => console.log(`[INFO] ${msg}`, ...meta),
    warn: (msg, ...meta) => console.warn(`[WARN] ${msg}`, ...meta),
    error: (msg, ...meta) => console.error(`[ERROR] ${msg}`, ...meta),
    command: (cmd, user, guild) => console.log(`[CMD] /${cmd} by ${user.tag}${guild ? ` in ${guild.name}` : " (DM)"}`),
    debug: (msg, ...meta) => {
        if (process.env.DEBUG === 'true') {
            console.log(`[DEBUG] ${msg}`, ...meta);
        }
    }
};

export default log;
