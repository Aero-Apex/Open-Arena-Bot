// ============================================
// 🏟️ OPEN ARENA - State Manager
// Manages cooldowns, chat history, and caches
// ============================================

import CONFIG from '../config/index.js';

const cooldowns = new Map();
const chatHistory = new Map();
const activeStatusIntervals = new Map();
const ratingCache = new Map();
const webhookCache = new Map();

/**
 * Check if user is on cooldown
 */
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

/**
 * Get cooldown duration for command
 */
export function getCooldownSeconds(commandName) {
    switch (commandName) {
        case "ping": return CONFIG.cooldowns.pingSeconds;
        case "rate": return CONFIG.cooldowns.rateSeconds;
        case "battle": return CONFIG.cooldowns.battleSeconds;
        default: return CONFIG.cooldowns.defaultSeconds;
    }
}

/**
 * Get chat history for channel
 */
export function getHistory(channelId) {
    return chatHistory.get(channelId)?.messages || [];
}

/**
 * Add message to chat history
 */
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

/**
 * Clear chat history for channel
 */
export function clearHistory(channelId) {
    chatHistory.delete(channelId);
}

/**
 * Start cleanup interval
 */
export function startCleanupInterval() {
    return setInterval(() => {
        const now = Date.now();
        
        // Clean expired cooldowns
        for (const [key, expires] of cooldowns) {
            if (now > expires) cooldowns.delete(key);
        }
        
        // Clean old chat history
        for (const [key, data] of chatHistory) {
            if (now - data.lastActive > CONFIG.memory.cleanupIntervalMs) {
                chatHistory.delete(key);
            }
        }
        
        // Clean expired rating cache
        for (const [key, entry] of ratingCache) {
            if (now > entry.expiresAt) {
                ratingCache.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}

/**
 * Stop all status intervals
 */
export function stopAllStatusIntervals() {
    for (const [, data] of activeStatusIntervals) {
        clearInterval(data.interval);
    }
    activeStatusIntervals.clear();
}

/**
 * Get or create status interval
 */
export function setStatusInterval(channelId, interval) {
    if (activeStatusIntervals.has(channelId)) {
        clearInterval(activeStatusIntervals.get(channelId).interval);
    }
    activeStatusIntervals.set(channelId, { interval });
}

/**
 * Delete status interval
 */
export function deleteStatusInterval(channelId) {
    activeStatusIntervals.delete(channelId);
}

/**
 * Get status interval
 */
export function getStatusInterval(channelId) {
    return activeStatusIntervals.get(channelId);
}

/**
 * Get cached rating
 */
export function getCachedRating(cacheKey) {
    return ratingCache.get(cacheKey);
}

/**
 * Set cached rating
 */
export function setCachedRating(cacheKey, data, ttlMs) {
    ratingCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttlMs
    });
}

/**
 * Get cached webhook
 */
export function getCachedWebhook(channelId) {
    return webhookCache.get(channelId);
}

/**
 * Set cached webhook
 */
export function setCachedWebhook(channelId, webhook) {
    webhookCache.set(channelId, webhook);
}

export default {
    checkCooldown,
    getCooldownSeconds,
    getHistory,
    addToHistory,
    clearHistory,
    startCleanupInterval,
    stopAllStatusIntervals,
    setStatusInterval,
    deleteStatusInterval,
    getStatusInterval,
    getCachedRating,
    setCachedRating,
    getCachedWebhook,
    setCachedWebhook
};
