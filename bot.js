// ============================================
// 🏟️ OPEN ARENA - Ultimate AI Discord Bot
// Features: NVIDIA Nemotron, SearXNG, Davinci Images, Admin Embeds
// ============================================
require("dotenv").config();
const {
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder,
    AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType,
    Events, PermissionFlagsBits, resolveColor
} = require("discord.js");
const axios = require("axios");
const { chromium } = require("playwright");
const crypto = require("crypto");

if (typeof fetch === "undefined") {
    console.error("ERROR: This bot requires Node.js 18 or higher.");
    process.exit(1);
}

// ═══════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════
const CONFIG = {
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

// ═══════════════════════════════════════════════════
// VALIDATION & LOGGING
// ═══════════════════════════════════════════════════
if (!CONFIG.discord.token || !CONFIG.discord.clientId) {
    console.error("ERROR: DISCORD_TOKEN and CLIENT_ID must be set.");
    process.exit(1);
}
if (!CONFIG.nvidia.apiKey) {
    console.error("ERROR: NVIDIA_API_KEY must be set.");
    process.exit(1);
}

const log = {
    info: (msg, ...meta) => console.log(`[INFO] ${msg}`, ...meta),
    warn: (msg, ...meta) => console.warn(`[WARN] ${msg}`, ...meta),
    error: (msg, ...meta) => console.error(`[ERROR] ${msg}`, ...meta),
    command: (cmd, user, guild) => console.log(`[CMD] /${cmd} by ${user.tag}${guild ? ` in ${guild.name}` : " (DM)"}`),
};

// ═══════════════════════════════════════════════════
// STATE & MEMORY MANAGEMENT
// ═══════════════════════════════════════════════════
const cooldowns = new Map();
const chatHistory = new Map();
const activeStatusIntervals = new Map();
const ratingCache = new Map();
const webhookCache = new Map();

function checkCooldown(userId, commandName, seconds) {
    const key = `${userId}:${commandName}`;
    const now = Date.now();
    const expires = cooldowns.get(key);
    if (expires && now < expires) return Math.ceil((expires - now) / 1000);
    cooldowns.set(key, now + seconds * 1000);
    return 0;
}

function getCooldownSeconds(commandName) {
    switch (commandName) {
        case "ping": return CONFIG.cooldowns.pingSeconds;
        case "rate": return CONFIG.cooldowns.rateSeconds;
        case "battle": return CONFIG.cooldowns.battleSeconds;
        default: return CONFIG.cooldowns.defaultSeconds;
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [key, expires] of cooldowns) { if (now > expires) cooldowns.delete(key); }
    for (const [key, data] of chatHistory) { if (now - data.lastActive > CONFIG.memory.cleanupIntervalMs) chatHistory.delete(key); }
    for (const [key, entry] of ratingCache) { if (now > entry.expiresAt) ratingCache.delete(key); }
}, 5 * 60 * 1000);

function getHistory(channelId) { return chatHistory.get(channelId)?.messages || []; }
function addToHistory(channelId, role, content) {
    if (!chatHistory.has(channelId)) chatHistory.set(channelId, { messages: [], lastActive: Date.now() });
    const data = chatHistory.get(channelId);
    data.messages.push({ role, content });
    data.lastActive = Date.now();
    if (data.messages.length > CONFIG.memory.maxMessages) data.messages.splice(0, data.messages.length - CONFIG.memory.maxMessages);
}
function clearHistory(channelId) { chatHistory.delete(channelId); }

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function keepTyping(channel) {
    let active = true;
    const iv = setInterval(async () => { if (active) try { await channel.sendTyping(); } catch {} }, CONFIG.typing.intervalMs);
    const maxTimeout = setTimeout(() => { active = false; clearInterval(iv); }, CONFIG.typing.maxDurationMs);
    channel.sendTyping().catch(() => {});
    return { stop() { active = false; clearInterval(iv); clearTimeout(maxTimeout); } };
}

function splitIntoChunks(text, maxLen = CONFIG.discordLimits.chunkSize) {
    if (text.length <= maxLen) return [text];
    const chunks = []; let remaining = text; let inCodeBlock = false;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) { chunks.push((inCodeBlock ? "```\n" : "") + remaining); break; }
        let splitAt = remaining.lastIndexOf("\n", maxLen);
        if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", maxLen);
        if (splitAt <= 0) splitAt = maxLen;
        let chunk = remaining.slice(0, splitAt);
        remaining = remaining.slice(splitAt).trimStart();
        const backticks = (chunk.match(/```/g) || []).length;
        if (backticks % 2 !== 0) { inCodeBlock = !inCodeBlock; chunk += "\n```"; }
        chunks.push(chunk);
        if (inCodeBlock && remaining.length > 0) remaining = "```\n" + remaining;
    }
    return chunks;
}

async function getOrCreateWebhook(channel, guild) {
    if (webhookCache.has(channel.id)) return webhookCache.get(channel.id);
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find((wh) => wh.owner?.id === client.user.id && wh.name === CONFIG.embed.WEBHOOK_NAME);
    if (!webhook) webhook = await channel.createWebhook({ name: CONFIG.embed.WEBHOOK_NAME, avatar: guild.iconURL({ size: 256 }) ?? undefined });
    webhookCache.set(channel.id, webhook);
    return webhook;
}

async function parseMentions(text, guild) {
    if (!text || !guild) return text;
    const matches = [...new Set(text.match(CONFIG.embed.MENTION_REGEX) || [])];
    if (matches.length === 0) return text.replace(/\n/g, '\n');
    let parsed = text.replace(/\n/g, '\n');
    for (const match of matches) {
        const name = match.slice(1).toLowerCase().trim();
        if (name === 'everyone' || name === 'here') continue;
        let member = guild.members.cache.find((m) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name);
        if (!member) { try { member = (await guild.members.search({ query: name, limit: 1 })).first(); } catch {} }
        if (member) { parsed = parsed.replaceAll(match, `<@${member.id}>`); continue; }
        const role = guild.roles.cache.find((r) => r.name.toLowerCase() === name);
        if (role) parsed = parsed.replaceAll(match, `<@&${role.id}>`);
    }
    return parsed;
}

function extractMentions(...texts) {
    const mentions = new Set();
    for (const text of texts) { if (!text) continue; const found = text.match(CONFIG.embed.EXTRACT_MENTION_REGEX); if (found) found.forEach((m) => mentions.add(m)); }
    return [...mentions];
}

function isValidImageUrl(url) { if (!url || typeof url !== 'string') return false; try { const { protocol } = new URL(url); return protocol === 'http:' || protocol === 'https:'; } catch { return false; } }
function safeResolveColor(colorInput) { if (!colorInput) return CONFIG.embed.DEFAULT_COLOR; try { return resolveColor(colorInput); } catch { return CONFIG.embed.DEFAULT_COLOR; } }

// ═══════════════════════════════════════════════════
// API INTEGRATIONS
// ═══════════════════════════════════════════════════
async function searchSearXNG(query) {
    try {
        const url = new URL(CONFIG.searxng.url);
        url.searchParams.set("q", query); url.searchParams.set("format", "json"); url.searchParams.set("language", "en");
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);
        const data = await res.json();
        const results = (data.results || []).slice(0, CONFIG.searxng.maxResults);
        if (results.length === 0) return "";
        return results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.content || ""}`).join("\n");
    } catch (err) { log.warn("SearXNG search failed:", err.message); return ""; }
}

async function askLLM(messages, onProgress = null, overrides = {}) {
    const res = await fetch(`${CONFIG.nvidia.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.nvidia.apiKey}` },
        body: JSON.stringify({
            model: CONFIG.nvidia.model, messages, temperature: overrides.temperature ?? CONFIG.nvidia.temperature,
            top_p: CONFIG.nvidia.topP, max_tokens: overrides.maxTokens ?? CONFIG.nvidia.maxTokens, stream: true,
            chat_template_kwargs: overrides.enableThinking ? { enable_thinking: true } : undefined,
            reasoning_budget: overrides.reasoningBudget ?? CONFIG.nvidia.reasoningBudget,
        }), signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`NVIDIA API ${res.status}: ${await res.text()}`);
    const reader = res.body.getReader(); const decoder = new TextDecoder();
    let buffer = "", reasoning = "", content = "";
    while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith("data: ")) continue; const raw = line.slice(6).trim(); if (raw === "[DONE]") continue;
            try {
                const parsed = JSON.parse(raw); const delta = parsed.choices?.[0]?.delta; if (!delta) continue;
                if (delta.reasoning_content) reasoning += delta.reasoning_content;
                if (delta.content) content += delta.content;
                if (onProgress) onProgress(reasoning, content);
            } catch { continue; }
        }
    }
    return { reasoning, content: content || "*(no response)*" };
}

function cleanAndParseJSON(text) {
    if (!text) throw new Error("Empty response."); let cleaned = text.trim();
    try { return JSON.parse(cleaned); } catch (e) {}
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) { try { return JSON.parse(codeBlockMatch[1].trim()); } catch (e) {} }
    const firstBrace = cleaned.indexOf("{"); const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) { try { return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)); } catch (e) {} }
    throw new Error("Could not parse JSON.");
}

// ═══════════════════════════════════════════════════
// PLAYWRIGHT: Mail.tm & Davinci
// ═══════════════════════════════════════════════════
const MAILTM_BASE = "https://api.mail.tm";
function generatePassword(length = 6) { return crypto.randomBytes(length).toString('hex').slice(0, length); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getMailtmDomain() {
    try {
        const r = await axios.get(`${MAILTM_BASE}/domains`, { timeout: 10000 });
        const domains = r.data["hydra:member"] || [];
        if (domains.length > 0) return domains[0].domain;
    } catch (e) {}
    return null;
}

async function createMailtmAccount() {
    const domain = await getMailtmDomain();
    if (!domain) throw new Error("Mail.tm unreachable.");
    const email = `${crypto.randomBytes(5).toString('hex')}@${domain}`;
    const password = generatePassword(10);
    await axios.post(`${MAILTM_BASE}/accounts`, { address: email, password }, { timeout: 10000 });
    return { email, password };
}

async function getMailtmToken(email, password) {
    const r = await axios.post(`${MAILTM_BASE}/token`, { address: email, password }, { timeout: 10000 });
    return r.data.token;
}

async function getLatestEmailCode(token) {
    const headers = { Authorization: `Bearer ${token}` };
    for (let i = 0; i < 24; i++) {
        try {
            const r = await axios.get(`${MAILTM_BASE}/messages`, { headers, timeout: 10000 });
            const messages = r.data["hydra:member"] || [];
            if (messages.length > 0) {
                const r2 = await axios.get(`${MAILTM_BASE}/messages/${messages[0].id}`, { headers });
                const content = (r2.data.text || "") + (r2.data.html ? r2.data.html[0] : "");
                const match = content.match(/\b(\d{6})\b/);
                if (match) return match[1];
            }
        } catch (e) {}
        await sleep(5000);
    }
    throw new Error("Verification email never arrived.");
}

// ─── DAVINCI AUTOMATION ────────────────────
async function automateDavinci(prompt, aspect, model, updateStatus) {
    let currentStep = 0;
    const step = async (index) => { currentStep = index; await updateStatus(currentStep); };
    let browser = null;
    const STEPS = ["📧 Email", "🔑 Auth", "📬 Code", "🎨 Canvas", "✍️ Prompt", "🚀 Render", "📥 Download"];
    try {
        await step(0);
        const { email, password: mailPassword } = await createMailtmAccount();
        const sitePassword = generatePassword(6);
        const mailToken = await getMailtmToken(email, mailPassword);
        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
        });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        });
        await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
        const page = await context.newPage();
        let pageCrashed = false;
        page.on('crash', () => { pageCrashed = true; });
        page.on('close', () => { pageCrashed = true; });

        async function safeWaitForSelector(selector, options = {}) {
            if (pageCrashed || page.isClosed()) throw new Error("Browser crashed.");
            try { return await page.waitForSelector(selector, { timeout: 20000, ...options }); }
            catch (e) { throw new Error(`UI Element not found: ${selector}`); }
        }

        const preExistingImageUrls = new Set();
        const newImageUrls = [];
        let generationStarted = false;

        page.on('response', async (response) => {
            const url = response.url();
            const status = response.status();
            const contentType = response.headers()['content-type'] || '';
            if (status !== 200 || !contentType.startsWith('image/')) return;
            if (url.includes('.svg') || url.includes('favicon') || url.includes('icon') ||
                url.includes('logo') || url.includes('avatar') || url.includes('thumbnail') ||
                url.includes('emoji') || url.includes('sprite')) return;
            const contentLength = parseInt(response.headers()['content-length'] || '0');
            if (!generationStarted) {
                preExistingImageUrls.add(url);
            } else {
                if (!preExistingImageUrls.has(url) && contentLength > 50000) { 
                    newImageUrls.push({ url, time: Date.now(), size: contentLength });
                    console.log(`[Interceptor] 🎨 Captured NEW generated image: ${url.substring(0, 80)}... (${contentLength} bytes)`);
                }
            }
        });

        await step(1);
        await page.goto("https://davinci.ai/app", { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(3000);
        await safeWaitForSelector("span:has-text('Continue with email')").then(el => el.click());
        await page.waitForTimeout(2000);
        await safeWaitForSelector("input[placeholder='Enter your mail']").then(el => el.fill(email));
        await page.click("button._auth-modal__primary-btn_ftqie_1");
        await page.waitForTimeout(2000);
        await safeWaitForSelector("input[placeholder='Password']").then(el => el.fill(sitePassword));
        await page.click("button._auth-modal__primary-btn_ftqie_1");
        await page.waitForTimeout(2000);

        await step(2);
        const code = await getLatestEmailCode(mailToken);
        for (let i = 0; i < 6; i++) {
            const digitInput = await safeWaitForSelector(`input[aria-label='Digit ${i + 1}']`);
            await digitInput.fill(code[i]);
            await page.waitForTimeout(300);
        }
        await page.click("button._auth-modal__primary-btn_ftqie_1");
        await page.waitForTimeout(5000);

        await step(3);
        await page.goto("https://davinci.ai/app/image-generator", { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(5000);

        const existingImgs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img'))
                .map(img => img.src)
                .filter(src => src && src.startsWith('http'));
        });
        existingImgs.forEach(url => preExistingImageUrls.add(url));
        console.log(`[Davinci] 📸 Snapshot: ${preExistingImageUrls.size} pre-existing images recorded`);

        try {
            const triggerSelectors = ["button:has-text('Model')", "[class*='model-selector']", "span:has-text('Nano Banana')", "span:has-text('GPT Image')"];
            for (const sel of triggerSelectors) {
                const el = await page.$(sel);
                if (el) { await el.click(); await page.waitForTimeout(1500); break; }
            }
            const targetModelSelectors = [`span:has-text('${model}')`, `button:has-text('${model}')`, `div[role='option']:has-text('${model}')`];
            for (const sel of targetModelSelectors) {
                try {
                    const el = await page.$(sel);
                    if (el) { await el.click(); await page.waitForTimeout(1000); break; }
                } catch (e) {}
            }
        } catch (e) {
            console.log(`[Davinci] Model selection issue: ${e.message}`);
        }

        await step(4);
        const editor = await safeWaitForSelector("div.tiptap.ProseMirror[contenteditable='true']");
        await editor.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);
        await editor.focus();
        for (const char of prompt) {
            await page.keyboard.type(char, { delay: 10 });
        }
        await page.waitForTimeout(1000);

        if (aspect !== "1:1") {
            const dimIcon = await safeWaitForSelector("span._generation-area__dimension-icon_1hvz4_1");
            await dimIcon.click();
            await page.waitForTimeout(1500);
            await page.click(`button._dropdown__item_8jzuk_1:has-text('${aspect}')`);
            await page.waitForTimeout(1000);
        }

        await step(5);
        generationStarted = true;
        newImageUrls.length = 0;
        const genBtn = await safeWaitForSelector("button[data-generate-button='true']");
        await genBtn.click();
        console.log('[Davinci] 🚀 Generate button clicked, waiting for NEW image...');

        await page.waitForTimeout(3000); 
        let imageUrl = null;
        const maxWait = 180000;
        const startTime = Date.now();
        let stableCount = 0;
        let lastCount = 0;

        while (Date.now() - startTime < maxWait) {
            const validNewImages = newImageUrls.filter(img => !preExistingImageUrls.has(img.url));
            if (validNewImages.length > 0) {
                const sorted = validNewImages.sort((a, b) => b.size - a.size);
                imageUrl = sorted[0].url;
                console.log(`[Davinci] ✅ Found NEW generated image via network: ${imageUrl.substring(0, 80)}... (${sorted[0].size} bytes)`);
                await page.waitForTimeout(2000);
                break;
            }

            const foundUrl = await page.evaluate((existingUrls) => {
                const containers = document.querySelectorAll(
                    '[class*="output"], [class*="result"], [class*="generation"], ' +
                    '[class*="image-grid"], [class*="gallery"], [class*="processing-item"], ' +
                    '[class*="generated"], [class*="image-item"]'
                );
                let bestImg = null, maxArea = 0;
                for (const container of containers) {
                    const imgs = container.querySelectorAll('img');
                    for (const img of imgs) {
                        if (img.complete && img.naturalWidth > 300 && img.naturalHeight > 300) {
                            const area = img.naturalWidth * img.naturalHeight;
                            const src = img.src || img.getAttribute('src');
                            if (area > maxArea && src &&
                                !existingUrls.includes(src) &&
                                !src.includes('avatar') && !src.includes('logo') &&
                                !src.includes('icon') && !src.includes('data:image')) {
                                maxArea = area;
                                bestImg = src;
                            }
                        }
                    }
                }
                return bestImg;
            }, Array.from(preExistingImageUrls));

            if (foundUrl) {
                imageUrl = foundUrl;
                console.log(`[Davinci] ✅ Found NEW generated image via DOM: ${imageUrl.substring(0, 80)}...`);
                await page.waitForTimeout(2000);
                break;
            }

            if (newImageUrls.length === lastCount && newImageUrls.length > 0) {
                stableCount++;
                if (stableCount >= 3) {
                    const sorted = newImageUrls.sort((a, b) => b.size - a.size);
                    imageUrl = sorted[0].url;
                    console.log(`[Davinci] ✅ Image stabilized: ${imageUrl.substring(0, 80)}...`);
                    break;
                }
            } else {
                stableCount = 0;
            }
            lastCount = newImageUrls.length;
            await page.waitForTimeout(3000);
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            if (elapsed % 15 === 0) {
                console.log(`[Davinci] ⏳ Still waiting for image... ${elapsed}s elapsed`);
            }
        }

        if (!imageUrl) {
            try {
                await page.screenshot({ path: `debug_${Date.now()}.png`, fullPage: true });
                console.log('[Davinci] 📸 Debug screenshot saved');
            } catch (e) {}
            throw new Error("Image rendering timed out. No valid generated image was detected (templates were filtered out).");
        }

        await step(6);
        let imgBuffer;
        if (imageUrl.startsWith('http')) {
            try {
                console.log(`[Davinci] 📥 Downloading: ${imageUrl.substring(0, 80)}...`);
                const imgResponse = await axios.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    maxContentLength: 50 * 1024 * 1024
                });
                imgBuffer = Buffer.from(imgResponse.data, 'binary');
                console.log(`[Davinci] ✅ Downloaded: ${imgBuffer.length} bytes`);
            } catch (e) {
                console.error(`[Davinci] Axios download failed: ${e.message}`);
            }
        }

        if (!imgBuffer) {
            try {
                console.log('[Davinci] Falling back to browser fetch...');
                const buffer = await page.evaluate(async (url) => {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    return Array.from(new Uint8Array(arrayBuffer));
                }, imageUrl);
                imgBuffer = Buffer.from(buffer);
                console.log(`[Davinci] ✅ Browser fetch: ${imgBuffer.length} bytes`);
            } catch (e) {
                console.error(`[Davinci] Browser fetch failed: ${e.message}`);
                throw new Error("Could not download image via any method.");
            }
        }

        const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
        console.log(`[Davinci] 🎉 Generation complete! Size: ${imgBuffer.length} bytes`);
        return { imgBuffer, fileName: `generated_${Date.now()}.${ext}` };
    } catch (e) {
        await updateStatus(currentStep, e.message);
        console.error('[Davinci] Automation error:', e);
        throw e;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

// ═══════════════════════════════════════════════════
// COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════
const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive"),
    new SlashCommandBuilder().setName("ask").setDescription("Ask the AI (NVIDIA Nemotron)")
        .addStringOption(o => o.setName("prompt").setDescription("Your question / prompt").setRequired(true))
        .addBooleanOption(o => o.setName("web_search").setDescription("Enable web search?").setRequired(false)),
    new SlashCommandBuilder().setName("status").setDescription("Check the status of connected services (Live Monitor)"),
    new SlashCommandBuilder().setName("clear").setDescription("Clear the bot's short-term memory in this channel"),
    new SlashCommandBuilder().setName("rate").setDescription("Rate an AI model (0-100)")
        .addStringOption(o => o.setName("model").setDescription("AI model name").setRequired(true).setMaxLength(100)),
    new SlashCommandBuilder().setName("battle").setDescription("Battle two AI models")
        .addStringOption(o => o.setName("model_a").setDescription("First model").setRequired(true).setMaxLength(100))
        .addStringOption(o => o.setName("model_b").setDescription("Second model").setRequired(true).setMaxLength(100)),
    new SlashCommandBuilder().setName("generate").setDescription("Generate an AI image using Davinci.ai")
        .addStringOption(o => o.setName("prompt").setDescription("Describe the image").setRequired(true))
        .addStringOption(o => o.setName("aspect").setDescription("Aspect ratio").setRequired(false)
            .addChoices({ name: '1:1', value: '1:1' }, { name: '9:16', value: '9:16' }, { name: '16:9', value: '16:9' }))
        .addStringOption(o => o.setName("model").setDescription("AI Model").setRequired(false)
            .addChoices(
                { name: 'GPT Image 2', value: 'GPT Image 2' }, 
                { name: 'Nano Banana 2', value: 'Nano Banana 2' }, 
                { name: 'Nano Banana Pro', value: 'Nano Banana Pro' }
            )),
    new SlashCommandBuilder().setName("message").setDescription("Send a formatted embed (Admin Only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true).setMaxLength(256))
        .addStringOption(o => o.setName("text").setDescription("Body").setRequired(true).setMaxLength(4000))
        .addStringOption(o => o.setName("color").setDescription("Color").setRequired(false))
        .addStringOption(o => o.setName("image_url").setDescription("Image URL").setRequired(false))
        .addAttachmentOption(o => o.setName("image").setDescription("Image File").setRequired(false))
        .addStringOption(o => o.setName("thumbnail_url").setDescription("Thumbnail URL").setRequired(false))
        .addStringOption(o => o.setName("title_url").setDescription("Title URL").setRequired(false))
        .addStringOption(o => o.setName("author_name").setDescription("Author").setRequired(false).setMaxLength(256))
        .addStringOption(o => o.setName("author_icon").setDescription("Author Icon").setRequired(false))
        .addStringOption(o => o.setName("footer").setDescription("Footer").setRequired(false).setMaxLength(2048))
        .addBooleanOption(o => o.setName("ping").setDescription("Ping mentions?").setRequired(false))
        .addBooleanOption(o => o.setName("webhook").setDescription("Use webhook?").setRequired(false)),
].map(cmd => ({ ...cmd.toJSON(), integration_types: [0, 1], contexts: [0, 1, 2] }));

// ═══════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════
async function handlePing(interaction) {
    const sent = await interaction.reply({ content: "Pinging…", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`**Pong!** Gateway: **${client.ws.ping}ms** | Round-trip: **${latency}ms**`);
}

async function handleClear(interaction) {
    clearHistory(interaction.channelId);
    await interaction.reply({ content: "🧹 **Memory cleared.**", ephemeral: true });
}

async function handleAsk(interaction) {
    const prompt = interaction.options.getString("prompt");
    const webSearch = interaction.options.getBoolean("web_search") ?? false;
    await interaction.deferReply();

    try {
        let systemMsg = CONFIG.bot.systemPrompt;
        if (webSearch) {
            const searchContext = await searchSearXNG(prompt);
            if (searchContext) systemMsg += `\n--- WEB SEARCH RESULTS ---\n${searchContext}`;
        }
        addToHistory(interaction.channelId, "user", prompt);
        const history = getHistory(interaction.channelId);
        const llmMessages = [{ role: "system", content: systemMsg }, ...history];
        await handleNemotronStreaming(interaction.channelId, llmMessages, interaction, prompt, webSearch);
    } catch (err) {
        log.error("Nemotron Ask error:", err);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Nemotron Error').setDescription(err.message.slice(0, 2000))] }).catch(() => { });
    }
}

async function handleNemotronStreaming(channelId, messages, interaction, prompt, webSearch) {
    let lastEdit = Date.now();
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'NVIDIA Nemotron', iconURL: 'https://nvdam.widen.net/content/udc6m8rk7u/original/nvidia-logo-brand-guidelines.png' })
        .setColor(0x76B900)
        .addFields(
            { name: '📝 Prompt', value: `> ${prompt.slice(0, 1000)}` },
            { name: '🌐 Web Search', value: webSearch ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '💬 Response', value: '⏳ *Initializing connection...*' }
        )
        .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });
    await interaction.editReply({ embeds: [embed] });

    const onProgress = (reasoning, content) => {
        if (Date.now() - lastEdit < 1500) return;
        lastEdit = Date.now();
        const currentEmbed = new EmbedBuilder()
            .setAuthor({ name: 'NVIDIA Nemotron', iconURL: 'https://nvdam.widen.net/content/udc6m8rk7u/original/nvidia-logo-brand-guidelines.png' })
            .setColor(0x76B900)
            .addFields(
                { name: '📝 Prompt', value: `> ${prompt.slice(0, 1000)}` },
                { name: '🌐 Web Search', value: webSearch ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '💬 Response', value: content.trim() ? content.trim().slice(0, 1000) + (content.length > 1000 ? '...' : '') : '⏳ *Generating...*' }
            )
            .setFooter({ text: `Requested by ${interaction.user.username} • Streaming...`, iconURL: interaction.user.displayAvatarURL() });
        if (reasoning && reasoning.trim()) {
            currentEmbed.setDescription(`**🧠 Reasoning:**\n||\`\`\`${reasoning.trim().slice(-400).replace(/\n/g, ' ')}\`\`\`||`);
        }
        interaction.editReply({ embeds: [currentEmbed] }).catch(() => { });
    };

    const { reasoning, content } = await askLLM(messages, onProgress);
    const finalEmbed = new EmbedBuilder()
        .setAuthor({ name: 'NVIDIA Nemotron', iconURL: 'https://nvdam.widen.net/content/udc6m8rk7u/original/nvidia-logo-brand-guidelines.png' })
        .setColor(0x76B900)
        .addFields(
            { name: '📝 Prompt', value: `> ${prompt.slice(0, 1000)}` },
            { name: '🌐 Web Search', value: webSearch ? '✅ Enabled' : '❌ Disabled', inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.user.username} • Completed`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();
    if (reasoning && reasoning.trim()) {
        finalEmbed.setDescription(`**🧠 Reasoning:**\n||\`\`\`${reasoning.trim().slice(-800).replace(/\n/g, ' ')}\`\`\`||`);
    }
    const finalContent = content || "*(no response)*";
    const chunks = splitIntoChunks(finalContent, 1000);
    finalEmbed.addFields({ name: '💬 Response', value: chunks[0] });
    await interaction.editReply({ embeds: [finalEmbed] });
    for (let i = 1; i < chunks.length; i++) {
        const followUpEmbed = new EmbedBuilder().setColor(0x76B900).setDescription(chunks[i]);
        await interaction.followUp({ embeds: [followUpEmbed] });
    }
    addToHistory(channelId, "assistant", content);
}

async function handleStatus(interaction) {
    await interaction.deferReply();
    if (activeStatusIntervals.has(interaction.channelId)) {
        clearInterval(activeStatusIntervals.get(interaction.channelId).interval);
        activeStatusIntervals.delete(interaction.channelId);
    }
    let isUpdating = false; let lastEditTime = 0; let lastState = ""; const startTime = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000; const THIRTY_MINUTES = 30 * 60 * 1000;

    const checkAndUpdate = async () => {
        if (isUpdating) return; isUpdating = true;
        try {
            const now = Date.now();
            if (now - startTime >= THIRTY_MINUTES) {
                clearInterval(interval);
                activeStatusIntervals.delete(interaction.channelId);
                await interaction.editReply({ content: "⏱️ Live status monitoring expired.", embeds: [] }).catch(() => { });
                return;
            }
            const checkEndpoint = async (name, url, timeout = 5000) => {
                const start = Date.now();
                try { const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(timeout) }); return { name, online: res.ok, latency: Date.now() - start }; }
                catch { return { name, online: false, latency: Date.now() - start }; }
            };
            const [discordPing, webuiStatus, searxngStatus] = await Promise.all([
                Promise.resolve(client.ws.ping),
                checkEndpoint("Open WebUI", CONFIG.status.url, 5000),
                checkEndpoint("SearXNG", CONFIG.searxng.url, 5000)
            ]);
            const currentState = `${webuiStatus.online}|${searxngStatus.online}`;
            const isFirstRun = lastState === "";
            const isStateChange = !isFirstRun && currentState !== lastState;
            const isRoutineUpdate = (now - lastEditTime) >= TEN_MINUTES;
            if (isFirstRun || isRoutineUpdate || isStateChange) {
                lastState = currentState; lastEditTime = now;
                const getStatusEmoji = (online, latency) => { if (!online) return "🔴"; if (latency > 1500) return "🟡"; return "🟢"; };
                const embed = new EmbedBuilder().setTitle("📡 System Status Dashboard (Live)").setTimestamp().setFooter({ text: `Updates every 10m or on outage` })
                    .addFields(
                        { name: "Discord Gateway", value: `${getStatusEmoji(true, discordPing)} \`${discordPing}ms\``, inline: true },
                        { name: "Open WebUI", value: `${getStatusEmoji(webuiStatus.online, webuiStatus.latency)} \`${webuiStatus.online ? webuiStatus.latency + "ms" : "Offline"}\``, inline: true },
                        { name: "SearXNG Search", value: `${getStatusEmoji(searxngStatus.online, searxngStatus.latency)} \`${searxngStatus.online ? searxngStatus.latency + "ms" : "Offline"}\``, inline: true }
                    );
                if (isStateChange) {
                    embed.setColor(currentState.includes("false") ? 0xED4245 : 0x57F287);
                    embed.setDescription(currentState.includes("false") ? "⚠️ **ALERT:** A service has gone offline!" : "✅ **RECOVERY:** All services back online!");
                } else {
                    embed.setColor(0x5865F2);
                }
                await interaction.editReply({ embeds: [embed] }).catch(e => { if (e.code === 10008) { clearInterval(interval); activeStatusIntervals.delete(interaction.channelId); } });
            }
        } catch { } finally { isUpdating = false; }
    };
    await checkAndUpdate();
    const interval = setInterval(checkAndUpdate, 30_000);
    activeStatusIntervals.set(interaction.channelId, { interval });
}

async function handleRate(interaction) {
    const rawModel = interaction.options.getString("model")?.trim();
    if (!rawModel) return interaction.reply({ content: "Provide a model name.", ephemeral: true });
    const modelName = rawModel.slice(0, CONFIG.rate.maxModelNameLength);
    const cacheKey = modelName.toLowerCase();
    const cached = ratingCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return interaction.reply({ embeds: [buildRatingEmbed(modelName, cached.data, true)] });
    }
    await interaction.deferReply();
    try {
        const searchResults = await searchSearXNG(`"${modelName}" AI model benchmark ranking review`);
        if (!searchResults) return interaction.editReply({ content: `🔍 Couldn't find data on **${modelName}**.` });
        const { content } = await askLLM([{ role: "system", content: CONFIG.rate.systemPrompt }, { role: "user", content: `Model: ${modelName}\nResults:\n${searchResults}` }], null, { temperature: CONFIG.rate.temperature, maxTokens: CONFIG.rate.maxTokens, enableThinking: true, reasoningBudget: 4096 });
        const rawParsed = cleanAndParseJSON(content);
        const parsed = { score: Math.max(0, Math.min(100, Math.round(Number(rawParsed.score) || 0))), pros: String(rawParsed.pros || "N/A").slice(0, 300), cons: String(rawParsed.cons || "N/A").slice(0, 300) };
        ratingCache.set(cacheKey, { data: parsed, expiresAt: Date.now() + CONFIG.rate.cacheTTLms });
        await interaction.editReply({ embeds: [buildRatingEmbed(modelName, parsed, false)] });
    } catch (err) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Rate Error').setDescription(err.message)] });
    }
}

function buildRatingEmbed(modelName, data, fromCache) {
    const filled = Math.round(data.score / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    const color = data.score >= 75 ? 0x57f287 : data.score >= 50 ? 0xfee75c : 0xed4245;
    return new EmbedBuilder().setTitle(`📊 Rating: ${modelName}`).setColor(color).setDescription(`**Score: ${data.score}/100**\n${bar}`).addFields({ name: "✅ Pros", value: data.pros }, { name: "❌ Cons", value: data.cons }).setFooter({ text: fromCache ? "⚡ Cached" : "🔍 Live Search" });
}

async function handleBattle(interaction) {
    const modelA = interaction.options.getString("model_a")?.trim();
    const modelB = interaction.options.getString("model_b")?.trim();
    if (!modelA || !modelB) return interaction.reply({ content: "Provide both models.", ephemeral: true });
    const sortedNames = [modelA.toLowerCase(), modelB.toLowerCase()].sort();
    const cacheKey = `battle:${sortedNames[0]}:${sortedNames[1]}`;
    const cached = ratingCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return interaction.reply({ embeds: [buildBattleEmbed(modelA, modelB, cached.data, true)] });
    await interaction.deferReply();
    try {
        const searchResults = await searchSearXNG(`"${modelA}" vs "${modelB}" AI model comparison benchmarks`);
        if (!searchResults) return interaction.editReply({ content: `🔍 Couldn't compare **${modelA}** vs **${modelB}**.` });
        const { content } = await askLLM([{ role: "system", content: CONFIG.battle.systemPrompt }, { role: "user", content: `A: ${modelA}\nB: ${modelB}\nResults:\n${searchResults}` }], null, { temperature: CONFIG.battle.temperature, maxTokens: CONFIG.battle.maxTokens, enableThinking: true, reasoningBudget: 4096 });
        const raw = cleanAndParseJSON(content);
        const parsed = { winner: String(raw.winner || "TIE"), scoreA: Math.max(0, Math.min(100, Math.round(Number(raw.scoreA) || 50))), scoreB: Math.max(0, Math.min(100, Math.round(Number(raw.scoreB) || 50))), whyABetter: String(raw.whyABetter || "N/A").slice(0, 350), whyBBetter: String(raw.whyBBetter || "N/A").slice(0, 350) };
        ratingCache.set(cacheKey, { data: parsed, expiresAt: Date.now() + CONFIG.rate.cacheTTLms });
        await interaction.editReply({ embeds: [buildBattleEmbed(modelA, modelB, parsed, false)] });
    } catch (err) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Battle Error').setDescription(err.message)] });
    }
}

function buildBattleEmbed(modelA, modelB, data, fromCache) {
    const barA = "█".repeat(Math.round(data.scoreA / 10)) + "░".repeat(10 - Math.round(data.scoreA / 10));
    const barB = "█".repeat(Math.round(data.scoreB / 10)) + "░".repeat(10 - Math.round(data.scoreB / 10));
    const color = Math.max(data.scoreA, data.scoreB) >= 75 ? 0x57f287 : Math.max(data.scoreA, data.scoreB) >= 50 ? 0xfee75c : 0xed4245;
    return new EmbedBuilder().setTitle(`⚔️ ${modelA} vs ${modelB}`).setColor(color).setDescription(`🏆 **Winner:** **${data.winner}**`).addFields({ name: `🤖 ${modelA}`, value: `**Score: ${data.scoreA}/100**\n${barA}`, inline: true }, { name: `🤖 ${modelB}`, value: `**Score: ${data.scoreB}/100**\n${barB}`, inline: true }, { name: `🟢 Why ${modelA} is better`, value: data.whyABetter }, { name: `🛡️ Why ${modelB} is better`, value: data.whyBBetter }).setFooter({ text: fromCache ? "⚡ Cached" : "🔍 Live Search" });
}

async function handleGenerate(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    const aspect = interaction.options.getString('aspect') || '1:1';
    const model = interaction.options.getString('model') || 'GPT Image 2';

    const STEPS = ["📧 Email", "🔑 Auth", "📬 Code", "🎨 Canvas", "✍️ Prompt", "🚀 Render", "📥 Download"];
    const updateStatus = async (step, error = null) => {
        const progress = (step / STEPS.length) * 100;
        const filled = Math.round(progress / 10);
        const empty = 10 - filled;
        const bar = '🟩'.repeat(filled) + '⬜'.repeat(empty);
        let statusText = "";
        for (let i = 0; i < STEPS.length; i++) {
            if (i < step) statusText += `✅ ${STEPS[i]}\n`;
            else if (i === step) statusText += error ? `❌ **${STEPS[i]}**\n└─ ⚠️ _${error.substring(0, 80)}_\n` : `⏳ **${STEPS[i]}...**\n`;
            else statusText += `⬜ ${STEPS[i]}\n`;
        }
        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Davinci.ai Image Generator', iconURL: 'https://davinci.ai/favicon.ico' })
            .setTitle(error ? '❌ Generation Interrupted' : '🎨 Initiating Generation Sequence...')
            .setColor(error ? 0xED4245 : 0xE67E22)
            .setDescription(`**Progress:** ${bar} (${Math.round(progress)}%)\n${statusText}`)
            .addFields(
                { name: '📝 Prompt', value: `\`\`\`${prompt.slice(0, 1000)}\`\`\`` },
                { name: '📐 Aspect', value: `\`${aspect}\``, inline: true },
                { name: '🤖 Model', value: `\`${model}\``, inline: true }
            )
            .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });
        await interaction.editReply({ embeds: [embed] }).catch(() => { });
    };

    try {
        const { imgBuffer, fileName } = await automateDavinci(prompt, aspect, model, updateStatus);
        const attachment = new AttachmentBuilder(imgBuffer, { name: fileName });
        const successEmbed = new EmbedBuilder().setTitle('✅ Generation Complete').setColor(0x57F287).setImage(`attachment://${fileName}`).addFields({ name: '📝 Prompt', value: `\`\`\`${prompt.slice(0, 1000)}\`\`\`` }).setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`regen_${interaction.id}`).setLabel('🔄 Regenerate').setStyle(ButtonStyle.Secondary));
        await interaction.editReply({ embeds: [successEmbed], files: [attachment], components: [row] });
    } catch (e) {
        log.error("Generate error:", e);
    }
}

async function handleMessage(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '🔒 **Access Denied**', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
        const rawTitle = interaction.options.getString('title');
        const rawText = interaction.options.getString('text');
        const colorInput = interaction.options.getString('color');
        const imageUrl = interaction.options.getString('image_url');
        const imageFile = interaction.options.getAttachment('image');
        const thumbnailUrl = interaction.options.getString('thumbnail_url');
        const titleUrl = interaction.options.getString('title_url');
        const authorName = interaction.options.getString('author_name');
        const authorIcon = interaction.options.getString('author_icon');
        const rawFooter = interaction.options.getString('footer');
        const shouldPing = interaction.options.getBoolean('ping') ?? true;
        const useWebhook = interaction.options.getBoolean('webhook') ?? false;
        const { guild, channel } = interaction;
        const [title, description, footer] = await Promise.all([parseMentions(rawTitle, guild), parseMentions(rawText, guild), parseMentions(rawFooter, guild)]);
        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(safeResolveColor(colorInput)).setTimestamp();
        if (titleUrl) embed.setURL(titleUrl);
        if (footer) embed.setFooter({ text: footer });
        if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
        if (authorName) embed.setAuthor({ name: authorName, iconURL: isValidImageUrl(authorIcon) ? authorIcon : undefined });
        if (imageFile) embed.setImage(imageFile.url);
        else if (imageUrl && isValidImageUrl(imageUrl)) embed.setImage(imageUrl);
        const mentions = extractMentions(title, description, footer);
        const payload = { content: shouldPing && mentions.length > 0 ? mentions.join(' ') : undefined, embeds: [embed], allowedMentions: shouldPing ? { parse: ['users', 'roles', 'everyone'] } : { parse: [] } };
        if (useWebhook) {
            const webhook = await getOrCreateWebhook(channel, guild);
            await webhook.send(payload);
        } else {
            await channel.send(payload);
        }
        await interaction.editReply({ content: `✅ **Message sent successfully!**` });
    } catch (error) {
        await interaction.editReply(`❌ **Error:** ${error.message}`);
    }
}

const commandHandlers = {
    ping: handlePing,
    clear: handleClear,
    ask: handleAsk,
    status: handleStatus,
    rate: handleRate,
    battle: handleBattle,
    generate: handleGenerate,
    message: handleMessage
};

// ═══════════════════════════════════════════════════
// CLIENT SETUP & EVENTS
// ═══════════════════════════════════════════════════
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once(Events.ClientReady, async () => {
    log.info(`Logged in as ${client.user.tag}`);
    client.user.setActivity({ name: "with electrons | /ask", type: ActivityType.Playing });
    const rest = new REST({ version: "10" }).setToken(CONFIG.discord.token);
    try {
        log.info("Registering slash commands…");
        const route = CONFIG.discord.guildId ? Routes.applicationGuildCommands(CONFIG.discord.clientId, CONFIG.discord.guildId) : Routes.applicationCommands(CONFIG.discord.clientId);
        await rest.put(route, { body: commands });
        log.info("Slash commands registered.");
    } catch (err) { log.error("Failed to register commands:", err); }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const isDM = !message.guild;
    const explicitMentionRegex = new RegExp(`<@!?${client.user.id}>`);
    const isStrictMention = explicitMentionRegex.test(message.content);
    if (!isDM && !isStrictMention) return;
    const remaining = checkCooldown(message.author.id, "ask", getCooldownSeconds("ask"));
    if (remaining > 0) return message.reply(`⏳ Slow down! Try again in **${remaining}s**.`);
    const userText = isDM ? message.content.trim() : message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
    if (!userText) return message.reply("Hey! Ask me a question!");
    const typing = keepTyping(message.channel);
    try {
        addToHistory(message.channel.id, "user", userText);
        const history = getHistory(message.channel.id);
        const llmMessages = [{ role: "system", content: CONFIG.bot.systemPrompt }, ...history];
        const sentMessage = await message.reply("⏳ *Thinking...*");
        let lastEdit = Date.now();
        const onProgress = (reasoning, content) => {
            if (Date.now() - lastEdit < 1500) return; lastEdit = Date.now();
            let liveMsg = "";
            if (reasoning.trim()) liveMsg += `> **🧠 Thinking...**\n> \`\`\`${reasoning.trim().slice(-200).replace(/\n/g, ' ')}\`\`\`\n`;
            if (content.trim()) liveMsg += content.trim();
            if (!liveMsg) liveMsg = "⏳ *The model is thinking...*";
            sentMessage.edit(liveMsg.slice(0, 1980)).catch(() => { });
        };
        const { reasoning, content } = await askLLM(llmMessages, onProgress);
        const finalFormatted = (reasoning ? `||🤔 **Thinking:** ${reasoning.trim().slice(0, 800)}||\n` : "") + content;
        addToHistory(message.channel.id, "assistant", content);
        const chunks = splitIntoChunks(finalFormatted);
        await sentMessage.edit(chunks[0]).catch(() => { });
        for (const chunk of chunks.slice(1)) await message.channel.send(chunk);
    } catch (err) { await message.reply(`Something went wrong: ${err.message}`.slice(0, 2000)); } finally { typing.stop(); }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('regen_')) return interaction.reply({ content: '💡 To regenerate, simply use the `/generate` command again!', ephemeral: true });
        return;
    }
    if (!interaction.isChatInputCommand()) return;
    log.command(interaction.commandName, interaction.user, interaction.guild);
    const handler = commandHandlers[interaction.commandName];
    if (!handler) return;
    const cooldownSecs = getCooldownSeconds(interaction.commandName);
    const remaining = checkCooldown(interaction.user.id, interaction.commandName, cooldownSecs);
    if (remaining > 0 && interaction.commandName !== "status" && interaction.commandName !== "message") {
        return interaction.reply({ content: `⏳ Slow down! Try again in **${remaining}s**.`, ephemeral: true });
    }
    await handler(interaction);
});

process.on("SIGINT", () => { log.info("Shutting down..."); for (const [, data] of activeStatusIntervals) clearInterval(data.interval); client.destroy(); process.exit(0); });
client.login(CONFIG.discord.token);
