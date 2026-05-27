import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} from 'discord.js';

import { automateDavinci } from '../services/davinciService.js';
import { askLLM, searchSearXNG } from '../services/nvidiaService.js';
import { askEaseMate } from '../services/easemateService.js';
import { clearHistory, startStatusInterval } from './stateManager.js';

import CONFIG from '../config/index.js';
import log from '../utils/logger.js';

export async function handleGenerate(interaction) {
    await interaction.deferReply();

    const prompt = interaction.options.getString('prompt');
    const aspect = interaction.options.getString('aspect') || '1:1';
    const model = interaction.options.getString('model') || 'GPT Image 2';

    const loadingEmbed = new EmbedBuilder()
        .setColor(CONFIG.colors.primary)
        .setTitle('🎨 Generating Image...')
        .setDescription(`**Prompt:** ${prompt}\n**Model:** ${model}\n**Aspect:** ${aspect}\n\n⏳ This may take up to 60 seconds due to browser automation...`)
        .setFooter({ text: 'Powered by Davinci.ai' });

    await interaction.editReply({ embeds: [loadingEmbed] });

    try {
        const updateStatus = async (step, msg) => {
            log.info(`Davinci Step ${step}: ${msg || 'Processing...'}`);
        };

        const { imgBuffer, fileName } = await automateDavinci(prompt, aspect, model, updateStatus);
        const attachment = new AttachmentBuilder(imgBuffer, { name: fileName });

        const successEmbed = new EmbedBuilder()
            .setColor(CONFIG.colors.success)
            .setTitle('✨ Image Generated Successfully!')
            .setImage(`attachment://${fileName}`)
            .addFields(
                { name: '📝 Prompt', value: prompt.slice(0, 1024), inline: false },
                { name: '🎨 Model', value: model, inline: true },
                { name: '📐 Aspect', value: aspect, inline: true }
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
            files: [attachment]
        });
    } catch (err) {
        log.error('Generate command error:', err);
        const errorEmbed = new EmbedBuilder()
            .setColor(CONFIG.colors.error)
            .setTitle('❌ Generation Failed')
            .setDescription(`Could not generate image: ${err.message}\n\n*Note: Davinci.ai may have updated their UI or enforced Cloudflare CAPTCHAs.*`)
            .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

export async function handleAsk(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    const model = interaction.options.getString('model') || 'nvidia';
    const webSearch = interaction.options.getBoolean('web_search') || false;

    if (model === 'easemate') {
        try {
            const response = await askEaseMate(prompt);
            await interaction.editReply(response.slice(0, 2000));
        } catch (err) {
            log.error('EaseMate ask error:', err);
            await interaction.editReply(`❌ EaseMate GPT-5.5 failed: ${err.message}`);
        }
        return;
    }

    try {
        let context = "";
        if (webSearch) {
            context = await searchSearXNG(prompt);
        }

        const userMessage = context
            ? `Web Search Results:\n${context}\n\nUser Prompt: ${prompt}`
            : prompt;

        const messages = [
            { role: "system", content: CONFIG.bot.systemPrompt },
            { role: "user", content: userMessage }
        ];

        const { reasoning, content } = await askLLM(messages, null, { enableThinking: true });

        const finalReply = (reasoning
            ? `||🤔 **Thinking:** ${reasoning.trim().slice(0, 800)}||\n`
            : "") + content;

        await interaction.editReply(finalReply.slice(0, 2000));
    } catch (err) {
        log.error('Ask command error:', err);
        await interaction.editReply(`❌ Failed to get response from NVIDIA Nemotron: ${err.message}`);
    }
}

export async function handleRate(interaction) {
    await interaction.deferReply();
    const model = interaction.options.getString('model');
    try {
        const searchResults = await searchSearXNG(`AI model benchmarks reviews ${model}`);
        const messages = [
            { role: "system", content: CONFIG.rate.systemPrompt },
            { role: "user", content: `Analyze the following web search results about the AI model "${model}" and provide the JSON rating:\n\n${searchResults}` }
        ];

        const { content } = await askLLM(messages, null, {
            temperature: CONFIG.rate.temperature,
            maxTokens: CONFIG.rate.maxTokens
        });

        await interaction.editReply(`**Model Rating for ${model}:**\n${content}`);
    } catch (err) {
        log.error('Rate command error:', err);
        await interaction.editReply('❌ Failed to rate model.');
    }
}

export async function handleBattle(interaction) {
    await interaction.deferReply();
    const modelA = interaction.options.getString('model_a');
    const modelB = interaction.options.getString('model_b');
    try {
        const searchResults = await searchSearXNG(`AI model comparison ${modelA} vs ${modelB} benchmarks`);
        const messages = [
            { role: "system", content: CONFIG.battle.systemPrompt },
            { role: "user", content: `Analyze the following web search results comparing "${modelA}" (Model A) and "${modelB}" (Model B) and provide the JSON matchup summary:\n\n${searchResults}` }
        ];

        const { content } = await askLLM(messages, null, {
            temperature: CONFIG.battle.temperature,
            maxTokens: CONFIG.battle.maxTokens
        });

        await interaction.editReply(`**⚔️ Arena Battle: ${modelA} vs ${modelB}**\n${content}`);
    } catch (err) {
        log.error('Battle command error:', err);
        await interaction.editReply('❌ Failed to battle models.');
    }
}

export async function handleClear(interaction) {
    try {
        clearHistory(interaction.channelId);
        await interaction.reply({ content: '🧠 Short-term memory for this channel has been wiped.', ephemeral: true });
    } catch (err) {
        log.error('Clear command error:', err);
        await interaction.reply({ content: '❌ Failed to clear memory.', ephemeral: true });
    }
}

export async function handlePing(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Roundtrip latency: ${latency}ms | API Latency: ${Math.round(interaction.client.ws.ping)}ms`);
}

export async function handleStatus(interaction) {
    await interaction.deferReply();
    startStatusInterval(interaction.client, interaction.channel);
    await interaction.editReply('📊 Status monitor initialized. Pinging endpoints...');
}

export async function handleMessage(interaction) {
    await interaction.reply({ content: '✅ Webhook embed sent.', ephemeral: true });
}
