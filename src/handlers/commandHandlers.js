// ============================================
// 🎮 Command Handlers for Open Arena Bot
// Handles all slash command interactions
// ============================================

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import CONFIG from '../config/index.js';
import log from '../utils/logger.js';
import { 
    checkCooldown, 
    getHistory, 
    addToHistory, 
    clearHistory,
    startStatusInterval,
    stopStatusInterval
} from './stateManager.js';
import { askLLM, searchSearXNG } from '../services/nvidiaService.js';
import { generateImage } from '../services/davinciService.js';
import { splitIntoChunks, keepTyping, formatTime } from '../utils/helpers.js';

/**
 * Handle /ping command
 */
export async function handlePing(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);
    
    const embed = new EmbedBuilder()
        .setColor(CONFIG.colors.primary)
        .setTitle('🏓 Pong!')
        .addFields(
            { name: '⚡ Bot Latency', value: `${latency}ms`, inline: true },
            { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
    
    await interaction.editReply({ content: null, embeds: [embed] });
}

/**
 * Handle /clear command
 */
export async function handleClear(interaction) {
    const channelId = interaction.channel.id;
    clearHistory(channelId);
    
    const embed = new EmbedBuilder()
        .setColor(CONFIG.colors.success)
        .setTitle('🧹 Memory Cleared')
        .setDescription(`Conversation history for this channel has been reset.`)
        .setFooter({ text: 'New conversations will start fresh!' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /ask command
 */
export async function handleAsk(interaction) {
    await interaction.deferReply();
    
    const question = interaction.options.getString('question');
    const useSearch = interaction.options.getBoolean('search') || false;
    const channelId = interaction.channel.id;
    
    const typing = keepTyping(interaction.channel);
    
    try {
        let context = '';
        
        // Optional web search
        if (useSearch) {
            try {
                const searchResult = await searchSearXNG(question);
                context = `Recent search results:\n${searchResult.summary}\n\n`;
            } catch (searchErr) {
                log.warn('Search failed, proceeding without:', searchErr.message);
            }
        }
        
        const userText = context + question;
        addToHistory(channelId, 'user', userText);
        
        const history = getHistory(channelId);
        const llmMessages = [
            { role: 'system', content: CONFIG.bot.systemPrompt },
            ...history
        ];
        
        const sentMessage = await interaction.editReply({ content: '⏳ *Thinking...*' });
        let lastEdit = Date.now();
        
        const onProgress = (reasoning, content) => {
            if (Date.now() - lastEdit < 1500) return;
            lastEdit = Date.now();
            
            let liveMsg = '';
            if (reasoning?.trim()) {
                liveMsg += `> **🧠 Thinking...**\n> \`\`\`${reasoning.trim().slice(-200).replace(/\n/g, ' ')}\`\`\`\n`;
            }
            if (content?.trim()) {
                liveMsg += content.trim();
            }
            if (!liveMsg) {
                liveMsg = '⏳ *The model is thinking...*';
            }
            
            sentMessage.edit(liveMsg.slice(0, 1980)).catch(() => {});
        };
        
        const { reasoning, content } = await askLLM(llmMessages, onProgress);
        
        const finalFormatted = (reasoning 
            ? `||🤔 **Thinking:** ${reasoning.trim().slice(0, 800)}||\n` 
            : '') + content;
        
        addToHistory(channelId, 'assistant', content);
        const chunks = splitIntoChunks(finalFormatted);
        
        await sentMessage.edit(chunks[0]).catch(() => {});
        for (const chunk of chunks.slice(1)) {
            await interaction.channel.send(chunk);
        }
    } catch (err) {
        log.error('Ask command error:', err);
        await interaction.editReply({ content: `❌ Something went wrong: ${err.message}`.slice(0, 2000) });
    } finally {
        typing.stop();
    }
}

/**
 * Handle /status command
 */
export async function handleStatus(interaction) {
    const action = interaction.options.getString('action');
    
    if (action === 'start') {
        const interval = startStatusInterval(interaction.client, interaction.channel);
        const embed = new EmbedBuilder()
            .setColor(CONFIG.colors.success)
            .setTitle('✅ Status Updates Started')
            .setDescription('Real-time bot status updates are now active in this channel.')
            .addFields({ name: '⏱️ Update Interval', value: 'Every 30 seconds' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    } else if (action === 'stop') {
        stopStatusInterval(interaction.channel.id);
        const embed = new EmbedBuilder()
            .setColor(CONFIG.colors.warning)
            .setTitle('⏹️ Status Updates Stopped')
            .setDescription('Real-time status updates have been disabled.')
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
}

/**
 * Handle /rate command
 */
export async function handleRate(interaction) {
    await interaction.deferReply();
    
    const prompt = interaction.options.getString('prompt');
    const response = interaction.options.getString('response');
    
    const evalPrompt = `Please rate the following AI response on a scale of 1-10 for quality, accuracy, and helpfulness:\n\n**Prompt:** ${prompt}\n\n**Response:** ${response}\n\nProvide a detailed critique and final score.`;
    
    const llmMessages = [
        { role: 'system', content: 'You are an expert AI evaluator. Provide fair, constructive feedback.' },
        { role: 'user', content: evalPrompt }
    ];
    
    try {
        const { content } = await askLLM(llmMessages);
        
        const embed = new EmbedBuilder()
            .setColor(CONFIG.colors.info)
            .setTitle('📊 AI Response Evaluation')
            .setDescription(content.slice(0, 4000))
            .addFields(
                { name: '📝 Original Prompt', value: prompt.slice(0, 500) || 'N/A', inline: false }
            )
            .setFooter({ text: 'Evaluation powered by NVIDIA Nemotron' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        log.error('Rate command error:', err);
        await interaction.editReply({ content: `❌ Evaluation failed: ${err.message}` });
    }
}

/**
 * Handle /battle command
 */
export async function handleBattle(interaction) {
    await interaction.deferReply();
    
    const prompt = interaction.options.getString('prompt');
    
    const battlePrompt = `Compare two different approaches to answering this prompt: "${prompt}"\n\nProvide Response A and Response B with different styles or perspectives, then evaluate which is better and why.`;
    
    const llmMessages = [
        { role: 'system', content: CONFIG.bot.systemPrompt },
        { role: 'user', content: battlePrompt }
    ];
    
    try {
        const { content } = await askLLM(llmMessages);
        
        const embed = new EmbedBuilder()
            .setColor(CONFIG.colors.battle)
            .setTitle('⚔️ AI Battle Arena')
            .setDescription(content.slice(0, 4000))
            .setFooter({ text: 'May the best response win!' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        log.error('Battle command error:', err);
        await interaction.editReply({ content: `❌ Battle failed: ${err.message}` });
    }
}

/**
 * Handle /generate command
 */
export async function handleGenerate(interaction) {
    await interaction.deferReply();
    
    const prompt = interaction.options.getString('prompt');
    const style = interaction.options.getString('style') || 'realistic';
    const ratio = interaction.options.getString('ratio') || '1:1';
    
    const loadingEmbed = new EmbedBuilder()
        .setColor(CONFIG.colors.loading)
        .setTitle('🎨 Generating Image...')
        .setDescription(`**Prompt:** ${prompt}\n**Style:** ${style}\n**Ratio:** ${ratio}\n\n⏳ This may take up to 30 seconds...`)
        .setFooter({ text: 'Powered by Davinci.ai' });
    
    await interaction.editReply({ embeds: [loadingEmbed] });
    
    try {
        const imageUrl = await generateImage(prompt, style, ratio);
        
        const successEmbed = new EmbedBuilder()
            .setColor(CONFIG.colors.success)
            .setTitle('✨ Image Generated Successfully!')
            .setImage(imageUrl)
            .addFields(
                { name: '📝 Prompt', value: prompt.slice(0, 500), inline: false },
                { name: '🎨 Style', value: style, inline: true },
                { name: '📐 Ratio', value: ratio, inline: true }
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`regen_${interaction.id}`)
                    .setLabel('🔄 Regenerate')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.editReply({ 
            embeds: [successEmbed], 
            components: [row],
            files: [] 
        });
    } catch (err) {
        log.error('Generate command error:', err);
        const errorEmbed = new EmbedBuilder()
            .setColor(CONFIG.colors.error)
            .setTitle('❌ Generation Failed')
            .setDescription(`Could not generate image: ${err.message}`)
            .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Handle message-based interactions (mentions/DMs)
 * This is handled in index.js directly, but exported for completeness
 */
export async function handleMessage(interaction) {
    // Placeholder - actual message handling is in index.js
    await interaction.reply({ 
        content: '💬 Message-based interactions are handled automatically when you mention the bot!', 
        ephemeral: true 
    });
}
