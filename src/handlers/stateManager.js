import { EmbedBuilder } from 'discord.js';
import CONFIG from '../config/index.js';
import log from '../utils/logger.js';

const cooldowns = new Map();
const chatHistory = new Map();
const activeStatusIntervals = new Map();
const ratingCache = new Map();
const webhookCache = new Map();

const cooldownMap = {
    ping: "pingSeconds",
    ask: "defaultSeconds",
    generate: "defaultSeconds",
    clear: "defaultSeconds",
    status: "defaultSeconds",
    message: "defaultSeconds",
    rate: "rateSeconds",
    battle: "battleSeconds",
};

export function checkCooldown(userId, commandName, seconds) {
    const key = `${userId}:${commandName}`;
    const now = Date.now();
    const expires = cooldowns.get(key);

    if (expires && now < expires) {
        return Math.ceil((expires - now) / 1000);
    }

    cooldowns.set(key, now + seconds * 1000);
    return 0;
}

export function getCooldownSeconds(commandName) {
    const key = cooldownMap[commandName] || "defaultSeconds";
    return CONFIG.cooldowns?.[key] ?? 10;
}

export function getHistory(channelId) {
    return chatHistory.get(channelId)?.messages || [];
}

export function addToHistory(channelId, role, content) {
    if (!chatHistory.has(channelId)) {
        chatHistory.set(channelId, { messages: [], lastActive: Date.now() });
    }
    const data = chatHistory.get(channelId);
    data.messages.push({ role, content });
    data.lastActive = Date.now();

    if (data.messages.length > CONFIG.memory.maxMessages) {
        data.messages.splice(0, data.messages.length - CONFIG.memory.maxMessages);
    }
}

export function clearHistory(channelId) {
    chatHistory.delete(channelId);
}

export function startCleanupInterval() {
    const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
    return setInterval(() => {
        const now = Date.now();

        for (const [key, expires] of cooldowns) {
            if (now > expires) cooldowns.delete(key);
        }

        for (const [key, data] of chatHistory) {
            if (now - data.lastActive > CONFIG.memory.cleanupIntervalMs) {
                chatHistory.delete(key);
            }
        }

        for (const [key, entry] of ratingCache) {
            if (now > entry.expiresAt) {
                ratingCache.delete(key);
            }
        }
    }, CLEANUP_INTERVAL_MS);
}

export function stopAllStatusIntervals() {
    for (const [, data] of activeStatusIntervals) {
        clearInterval(data.interval);
    }
    activeStatusIntervals.clear();
}

export function startStatusInterval(client, channel) {
    if (activeStatusIntervals.has(channel.id)) {
        clearInterval(activeStatusIntervals.get(channel.id).interval);
    }

    const updateStatus = async () => {
        try {
            const embed = new EmbedBuilder()
                .setColor(CONFIG.colors.primary)
                .setTitle('🤖 Bot Status Update')
                .addFields(
                    { name: '⚡ Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true },
                    { name: '📡 Uptime', value: formatUptime(client.uptime), inline: true },
                    { name: '👥 Servers', value: `${client.guilds.cache.size}`, inline: true }
                )
                .setFooter({ text: `Logged in as ${client.user.tag}` })
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            log.error('Status update failed:', err);
            stopStatusInterval(channel.id);
        }
    };

    updateStatus();

    const interval = setInterval(updateStatus, 30000);
    activeStatusIntervals.set(channel.id, { interval });

    return interval;
}

export function stopStatusInterval(channelId) {
    const data = activeStatusIntervals.get(channelId);
    if (data?.interval) {
        clearInterval(data.interval);
        activeStatusIntervals.delete(channelId);
    }
}

function formatUptime(ms) {
    if (!ms) return "0s";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}

export function getCachedRating(cacheKey) {
    return ratingCache.get(cacheKey);
}

export function setCachedRating(cacheKey, data, ttlMs) {
    ratingCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttlMs
    });
}

export function getCachedWebhook(channelId) {
    return webhookCache.get(channelId);
}

export function setCachedWebhook(channelId, webhook) {
    webhookCache.set(channelId, webhook);
}
