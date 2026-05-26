// ============================================
// 🏟️ OPEN ARENA - Helper Utilities
// Common utility functions
// ============================================

import CONFIG from '../config/index.js';
import { EmbedBuilder, resolveColor } from 'discord.js';

/**
 * Split text into chunks for Discord message limits
 */
export function splitIntoChunks(text, maxLen = CONFIG.discordLimits.chunkSize) {
    if (text.length <= maxLen) return [text];
    const chunks = []; 
    let remaining = text; 
    let inCodeBlock = false;
    
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) { 
            chunks.push((inCodeBlock ? "```\n" : "") + remaining); 
            break; 
        }
        let splitAt = remaining.lastIndexOf("\n", maxLen);
        if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", maxLen);
        if (splitAt <= 0) splitAt = maxLen;
        let chunk = remaining.slice(0, splitAt);
        remaining = remaining.slice(splitAt).trimStart();
        const backticks = (chunk.match(/```/g) || []).length;
        if (backticks % 2 !== 0) { 
            inCodeBlock = !inCodeBlock; 
            chunk += "\n```"; 
        }
        chunks.push(chunk);
        if (inCodeBlock && remaining.length > 0) {
            remaining = "```\n" + remaining;
        }
    }
    return chunks;
}

/**
 * Check if URL is valid image URL
 */
export function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Safely resolve color for embeds
 */
export function safeResolveColor(colorInput) {
    if (!colorInput) return CONFIG.embed.DEFAULT_COLOR;
    try {
        return resolveColor(colorInput);
    } catch {
        return CONFIG.embed.DEFAULT_COLOR;
    }
}

/**
 * Parse mentions in text
 */
export async function parseMentions(text, guild) {
    if (!text || !guild) return text;
    const matches = [...new Set(text.match(CONFIG.embed.MENTION_REGEX) || [])];
    if (matches.length === 0) return text.replace(/\n/g, '\n');
    
    let parsed = text.replace(/\n/g, '\n');
    for (const match of matches) {
        const name = match.slice(1).toLowerCase().trim();
        if (name === 'everyone' || name === 'here') continue;
        
        let member = guild.members.cache.find(
            (m) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name
        );
        if (!member) {
            try {
                member = (await guild.members.search({ query: name, limit: 1 })).first();
            } catch {}
        }
        if (member) {
            parsed = parsed.replaceAll(match, `<@${member.id}>`);
            continue;
        }
        const role = guild.roles.cache.find((r) => r.name.toLowerCase() === name);
        if (role) {
            parsed = parsed.replaceAll(match, `<@&${role.id}>`);
        }
    }
    return parsed;
}

/**
 * Extract mentions from text
 */
export function extractMentions(...texts) {
    const mentions = new Set();
    for (const text of texts) {
        if (!text) continue;
        const found = text.match(CONFIG.embed.EXTRACT_MENTION_REGEX);
        if (found) found.forEach((m) => mentions.add(m));
    }
    return [...mentions];
}

/**
 * Clean and parse JSON from text (handles code blocks)
 */
export function cleanAndParseJSON(text) {
    if (!text) throw new Error("Empty response.");
    let cleaned = text.trim();
    
    try {
        return JSON.parse(cleaned);
    } catch (e) {}
    
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
        try {
            return JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {}
    }
    
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch (e) {}
    }
    
    throw new Error("Could not parse JSON.");
}

/**
 * Keep typing indicator active
 */
export function keepTyping(channel) {
    let active = true;
    const iv = setInterval(async () => {
        if (active) {
            try {
                await channel.sendTyping();
            } catch {}
        }
    }, CONFIG.typing.intervalMs);
    
    const maxTimeout = setTimeout(() => {
        active = false;
        clearInterval(iv);
    }, CONFIG.typing.maxDurationMs);
    
    channel.sendTyping().catch(() => {});
    
    return {
        stop() {
            active = false;
            clearInterval(iv);
            clearTimeout(maxTimeout);
        }
    };
}

export default {
    splitIntoChunks,
    isValidImageUrl,
    safeResolveColor,
    parseMentions,
    extractMentions,
    cleanAndParseJSON,
    keepTyping
};
