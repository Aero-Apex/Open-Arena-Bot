import { EmbedBuilder } from 'discord.js';
import CONFIG from '../config/index.js';

export function renderSteps(steps, currentIdx) {
    return steps.map((s, i) => {
        const label = typeof s === 'string' ? s : s.label;
        if (i < currentIdx) return `✅ ${label}`;
        if (i === currentIdx) return `⏳ **${label}**`;
        return `⬜ ${label}`;
    }).join('\n');
}

export function buildProgressEmbed(title, description, steps, currentIdx, options = {}) {
    const embed = new EmbedBuilder()
        .setColor(options.color || CONFIG.colors.primary)
        .setTitle(title)
        .setDescription(description + '\n\n📝 **Steps:**\n' + renderSteps(steps, currentIdx))
        .setFooter({ text: options.footer || 'Open Arena' })
        .setTimestamp();

    if (options.fields) embed.addFields(options.fields);
    return embed;
}

export function buildResultEmbed(title, description, options = {}) {
    const embed = new EmbedBuilder()
        .setColor(options.color || CONFIG.colors.success)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: options.footer || 'Open Arena' })
        .setTimestamp();

    if (options.fields) embed.addFields(options.fields);
    if (options.image) embed.setImage(options.image);
    return embed;
}

export function buildErrorEmbed(title, description, options = {}) {
    return new EmbedBuilder()
        .setColor(CONFIG.colors.error)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: options.footer || 'Open Arena' })
        .setTimestamp();
}
