import 'dotenv/config';

const required = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
};

const missing = Object.entries(required).filter(([, v]) => !v);
if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.map(([k]) => k).join(', ')}`);
    process.exit(1);
}

const CONFIG = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID,
    },

    nvidia: {
        baseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-70b-instruct",
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 1024,
        reasoningBudget: 1024,
    },

    searxng: {
        url: process.env.SEARXNG_URL || "http://192.168.88.32:8080/search",
        maxResults: 5,
    },

    bot: {
        systemPrompt: "You are OpenArena, an advanced AI assistant powered by NVIDIA Nemotron. You provide detailed, context-aware, and helpful responses.",
        statusUrl: process.env.STATUS_URL || "https://openarena.eu.cc/",
    },

    embed: {
        DEFAULT_COLOR: 0x5865F2,
        MENTION_REGEX: /@(\w+)/g,
        EXTRACT_MENTION_REGEX: /<@!?(\d+)>/g,
    },

    rate: {
        systemPrompt: "You are an expert AI benchmark analyst. Analyze the provided search results and generate a detailed scorecard for the AI model.",
        temperature: 0.4,
        maxTokens: 1500,
    },

    battle: {
        systemPrompt: "You are an expert AI arena judge. Compare the two AI models based on the provided search results and declare a winner based on reasoning and performance.",
        temperature: 0.4,
        maxTokens: 1500,
    },

    cooldowns: {
        pingSeconds: 5,
        rateSeconds: 30,
        battleSeconds: 30,
        defaultSeconds: 10,
    },

    memory: {
        maxMessages: 20,
        cleanupIntervalMs: 30 * 60 * 1000,
    },

    colors: {
        primary: 0x5865F2,
        error: 0xFF0000,
        success: 0x00FF00,
        warning: 0xFFFF00,
    },

    discordLimits: {
        chunkSize: 2000,
    },

    typing: {
        intervalMs: 5000,
        maxDurationMs: 120_000,
    },
};

export default CONFIG;
