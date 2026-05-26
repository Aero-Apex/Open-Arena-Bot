import 'dotenv/config';

// Validate required environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('[FATAL] Missing DISCORD_TOKEN in .env file.');
    process.exit(1);
}

const CONFIG = {
    // ✅ FIXED: Grouped credentials under 'discord' to match src/index.js
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID,
    },
    bot: {
        systemPrompt: "You are OpenArena, an advanced AI assistant powered by NVIDIA Nemotron. You provide detailed, context-aware, and helpful responses."
    },
    embed: {
        DEFAULT_COLOR: 0x5865F2 // Discord Blurple
    },
    rate: {
        systemPrompt: "You are an expert AI benchmark analyst. Analyze the provided search results and generate a detailed scorecard for the AI model.",
        temperature: 0.4,
        maxTokens: 1500
    },
    battle: {
        systemPrompt: "You are an expert AI arena judge. Compare the two AI models based on the provided search results and declare a winner based on reasoning and performance.",
        temperature: 0.4,
        maxTokens: 1500
    },
    services: {
        nvidiaApiKey: process.env.NVIDIA_API_KEY,
        searxngUrl: process.env.SEARXNG_URL || "http://192.168.88.32:8080/search",
        statusUrl: process.env.STATUS_URL || "https://openarena.eu.cc/"
    }
};

export default CONFIG;
