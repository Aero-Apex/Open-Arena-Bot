// ============================================
// 🏟️ OPEN ARENA - Configuration
// Centralized configuration management
// ============================================

require("dotenv").config();

export const CONFIG = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID
    },
    nvidia: {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        temperature: 0.6,
        topP: 0.95,
        maxTokens: 65536,
        reasoningBudget: 16384,
    },
    searxng: {
        url: process.env.SEARXNG_URL || "http://192.168.88.32:8080/search",
        maxResults: 5
    },
    status: {
        url: process.env.STATUS_URL || "https://openarena.eu.cc/",
        timeoutMs: 10_000
    },
    discordLimits: {
        messageMax: 2000,
        chunkSize: 1980,
        editThrottleMs: 1500,
        maxReasoningPreview: 800
    },
    cooldowns: {
        defaultSeconds: 10,
        pingSeconds: 5,
        rateSeconds: 30,
        battleSeconds: 30
    },
    memory: {
        maxMessages: 10,
        cleanupIntervalMs: 30 * 60 * 1000
    },
    typing: {
        intervalMs: 4000,
        maxDurationMs: 30_000
    },
    rate: {
        maxModelNameLength: 100,
        cacheTTLms: 24 * 60 * 60 * 1000,
        maxTokens: 2048,
        temperature: 0.3,
        systemPrompt: "You are an expert AI model analyst. Given web search results about an AI model, produce a concise rating. Output your response as a valid JSON object inside a ```json ``` markdown code block.\nThe JSON must have this exact structure:\n{\n\"score\": <number 0-100>,\n\"pros\": \"<short text, max 150 chars>\",\n\"cons\": \"<short text, max 150 chars>\"\n}\nScore based on benchmarks, community reception, capabilities, and value.",
    },
    battle: {
        maxTokens: 3000,
        temperature: 0.4,
        systemPrompt: "You are an expert AI benchmark analyst running a model comparison arena. Given web search results comparing two AI models (Model A vs Model B), critically analyze their performance and produce a matchup summary.\nOutput your final response as a valid JSON object inside a ```json ``` code block following this exact structure:\n{\n\"winner\": \"<Name of the model that performs better overall>\",\n\"scoreA\": <number 0-100 for Model A>,\n\"scoreB\": <number 0-100 for Model B>,\n\"whyABetter\": \"<Explain clearly and concisely why Model A is better than Model B, highlighting strengths. Max 250 chars>\",\n\"whyBBetter\": \"<Explain clearly and concisely why Model B is better than Model A (where Model A is worse/fails). Max 250 chars>\"\n}"
    },
    bot: {
        name: "OpenArena",
        systemPrompt: "You are OpenArena, a helpful, concise AI assistant inside a Discord bot. Use Markdown formatting where helpful but keep it readable for Discord. Be conversational and concise. If web search results are provided, cite them in your answer.",
    },
    embed: {
        DEFAULT_COLOR: 0x5865F2,
        MENTION_REGEX: /@([a-zA-Z0-9_ ]{2,32})/g,
        EXTRACT_MENTION_REGEX: /<@&?\d+>|@everyone|@here/g,
        WEBHOOK_NAME: 'OpenArena Webhook'
    }
};

// Validation
if (!CONFIG.discord.token || !CONFIG.discord.clientId) {
    console.error("ERROR: DISCORD_TOKEN and CLIENT_ID must be set.");
    process.exit(1);
}
if (!CONFIG.nvidia.apiKey) {
    console.error("ERROR: NVIDIA_API_KEY must be set.");
    process.exit(1);
}

export default CONFIG;
