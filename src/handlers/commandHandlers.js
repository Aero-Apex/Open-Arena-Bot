import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} from 'discord.js';

import { automateDavinci } from '../services/davinciService.js';
import { askLLM, searchSearXNG } from '../services/nvidiaService.js';

import { clearHistory, startStatusInterval } from './stateManager.js';
import { buildProgressEmbed, buildResultEmbed, buildErrorEmbed } from '../utils/stepEmbed.js';

import CONFIG from '../config/index.js';
import log from '../utils/logger.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function updateEmbed(interaction, title, description, steps, currentIdx, options = {}) {
    const embed = buildProgressEmbed(title, description, steps, currentIdx, options);
    return interaction.editReply({ embeds: [embed] }).catch(() => {});
}

// ─── /generate ──────────────────────────────────────────────────────────

const generateSteps = [
    "🚀 Initializing browser",
    "🌐 Navigating to Davinci",
    "🔑 Creating account",
    "📬 Verifying email",
    "🎨 Setting up canvas",
    "✍️ Entering prompt",
    "🚀 Rendering image",
    "📥 Downloading result",
];

export async function handleGenerate(interaction) {
    await interaction.deferReply();

    const prompt = interaction.options.getString('prompt');
    const aspect = interaction.options.getString('aspect') || '1:1';
    const model = interaction.options.getString('model') || 'GPT Image 2';
    let currentStep = 0;

    const desc = `📝 **Prompt:** ${prompt}\n🎨 **Model:** ${model}\n📐 **Aspect:** ${aspect}`;
    await updateEmbed(interaction, '🎨 Generating Image...', desc, generateSteps, 0, { footer: 'Powered by Davinci.ai' });

    try {
        const updateStatus = async (stepNum) => {
            currentStep = Math.min(stepNum, generateSteps.length - 1);
            await updateEmbed(interaction, '🎨 Generating Image...', desc, generateSteps, currentStep, { footer: 'Powered by Davinci.ai' });
        };

        const { imgBuffer, fileName } = await automateDavinci(prompt, aspect, model, updateStatus);

        currentStep = generateSteps.length;
        await updateEmbed(interaction, '🎨 Generating Image...', desc, generateSteps, currentStep, { footer: 'Powered by Davinci.ai' });

        const attachment = new AttachmentBuilder(imgBuffer, { name: fileName });
        const resultEmbed = buildResultEmbed(
            '✨ Image Generated Successfully!',
            `✅ All steps completed!`,
            {
                fields: [
                    { name: '📝 Prompt', value: prompt.slice(0, 1024), inline: false },
                    { name: '🎨 Model', value: model, inline: true },
                    { name: '📐 Aspect', value: aspect, inline: true },
                ],
                image: `attachment://${fileName}`,
                footer: `Requested by ${interaction.user.tag}`
            }
        );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`regen_${interaction.id}`)
                    .setLabel('🔄 Regenerate')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({ embeds: [resultEmbed], components: [row], files: [attachment] });
    } catch (err) {
        log.error('Generate command error:', err);
        const errorEmbed = buildErrorEmbed(
            '❌ Generation Failed',
            `Step failed at **${generateSteps[currentStep] || 'unknown'}**\n\n${err.message}\n\n*Note: Davinci.ai may have updated their UI or enforced Cloudflare CAPTCHAs.*`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// ─── /ask ───────────────────────────────────────────────────────────────

const nvidiaSteps = [
    "🔍 Searching web",
    "🤖 Querying NVIDIA Nemotron",
    "📝 Formatting response",
];

export async function handleAsk(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    const webSearch = interaction.options.getBoolean('web_search') || false;

    const steps = webSearch ? nvidiaSteps : nvidiaSteps.slice(1);
    const desc = `📝 **Prompt:**\n${prompt.slice(0, 1000)}${webSearch ? '\n\n🌐 **Web search enabled**' : ''}`;

    await updateEmbed(interaction, '🧠 NVIDIA Nemotron', desc, steps, 0, { footer: 'NVIDIA Nemotron' });

    try {
        let context = "";
        if (webSearch) {
            context = await searchSearXNG(prompt);
        }

        const queryStep = webSearch ? 1 : 0;
        await updateEmbed(interaction, '🧠 NVIDIA Nemotron', desc, steps, queryStep, { footer: 'NVIDIA Nemotron' });

        const userMessage = context
            ? `Web Search Results:\n${context}\n\nUser Prompt: ${prompt}`
            : prompt;

        const messages = [
            { role: "system", content: CONFIG.bot.systemPrompt },
            { role: "user", content: userMessage }
        ];

        const { reasoning, content } = await askLLM(messages, null, { enableThinking: true });

        const finalIdx = steps.length;
        await updateEmbed(interaction, '🧠 NVIDIA Nemotron', desc, steps, finalIdx, { footer: 'NVIDIA Nemotron' });

        const finalReply = (reasoning
            ? `||🤔 **Thinking:** ${reasoning.trim().slice(0, 800)}||\n`
            : "") + content;

        await interaction.editReply(finalReply.slice(0, 2000));
    } catch (err) {
        log.error('Ask command error:', err);
        await interaction.editReply({ content: `❌ Failed to get response from NVIDIA Nemotron: ${err.message}` });
    }
}

// ─── /rate ──────────────────────────────────────────────────────────────

const rateSteps = [
    "🔍 Searching web for benchmarks",
    "🤖 Analyzing with Nemotron",
    "📊 Formatting scorecard",
];

export async function handleRate(interaction) {
    await interaction.deferReply();
    const model = interaction.options.getString('model');
    const desc = `🏷️ **Model:** ${model}`;

    await updateEmbed(interaction, '📊 Rating Model...', desc, rateSteps, 0, { footer: 'Open Arena' });

    try {
        const searchResults = await searchSearXNG(`AI model benchmarks reviews ${model}`);

        await updateEmbed(interaction, '📊 Rating Model...', desc, rateSteps, 1, { footer: 'Open Arena' });

        const messages = [
            { role: "system", content: CONFIG.rate.systemPrompt },
            { role: "user", content: `Analyze the following web search results about the AI model "${model}" and provide the JSON rating:\n\n${searchResults}` }
        ];

        const { content } = await askLLM(messages, null, {
            temperature: CONFIG.rate.temperature,
            maxTokens: CONFIG.rate.maxTokens
        });

        await updateEmbed(interaction, '📊 Rating Model...', desc, rateSteps, 2, { footer: 'Open Arena' });

        const resultEmbed = buildResultEmbed(
            `📊 Rating: ${model}`,
            content.slice(0, 4000),
            { footer: `Requested by ${interaction.user.tag}` }
        );

        await interaction.editReply({ embeds: [resultEmbed] });
    } catch (err) {
        log.error('Rate command error:', err);
        const errorEmbed = buildErrorEmbed('❌ Rating Failed', err.message.slice(0, 2000));
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// ─── /battle ────────────────────────────────────────────────────────────

const battleSteps = [
    "🔍 Searching for comparisons",
    "🤖 Judging with Nemotron",
    "⚔️ Formatting battle results",
];

export async function handleBattle(interaction) {
    await interaction.deferReply();
    const modelA = interaction.options.getString('model_a');
    const modelB = interaction.options.getString('model_b');
    const desc = `⚔️ **${modelA}** vs **${modelB}**`;

    await updateEmbed(interaction, '⚔️ Arena Battle', desc, battleSteps, 0, { footer: 'Open Arena' });

    try {
        const searchResults = await searchSearXNG(`AI model comparison ${modelA} vs ${modelB} benchmarks`);

        await updateEmbed(interaction, '⚔️ Arena Battle', desc, battleSteps, 1, { footer: 'Open Arena' });

        const messages = [
            { role: "system", content: CONFIG.battle.systemPrompt },
            { role: "user", content: `Analyze the following web search results comparing "${modelA}" (Model A) and "${modelB}" (Model B) and provide the JSON matchup summary:\n\n${searchResults}` }
        ];

        const { content } = await askLLM(messages, null, {
            temperature: CONFIG.battle.temperature,
            maxTokens: CONFIG.battle.maxTokens
        });

        await updateEmbed(interaction, '⚔️ Arena Battle', desc, battleSteps, 2, { footer: 'Open Arena' });

        const resultEmbed = buildResultEmbed(
            `⚔️ ${modelA} vs ${modelB} — Results`,
            content.slice(0, 4000),
            { footer: `Requested by ${interaction.user.tag}` }
        );

        await interaction.editReply({ embeds: [resultEmbed] });
    } catch (err) {
        log.error('Battle command error:', err);
        const errorEmbed = buildErrorEmbed('❌ Battle Failed', err.message.slice(0, 2000));
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// ─── /clear ─────────────────────────────────────────────────────────────

const clearSteps = [
    "🧹 Clearing channel memory",
    "✅ Memory wiped",
];

export async function handleClear(interaction) {
    const desc = `🗂️ **Channel:** ${interaction.channel?.name || 'DM'}`;
    await interaction.reply({
        embeds: [buildProgressEmbed('🧹 Clearing Memory...', desc, clearSteps, 0, { footer: 'Open Arena' })],
        ephemeral: true
    });

    try {
        clearHistory(interaction.channelId);
        const resultEmbed = buildResultEmbed(
            '✅ Memory Cleared',
            '🧠 Short-term memory for this channel has been wiped.',
            { footer: 'Open Arena' }
        );
        await interaction.editReply({ embeds: [resultEmbed] });
    } catch (err) {
        log.error('Clear command error:', err);
        const errorEmbed = buildErrorEmbed('❌ Clear Failed', err.message.slice(0, 2000));
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// ─── /ping ──────────────────────────────────────────────────────────────

const pingSteps = [
    "📡 Sending ping to Discord",
    "📊 Calculating latency",
    "✅ Done!",
];

export async function handlePing(interaction) {
    const desc = '🏓 Testing connection latency...';
    const sent = await interaction.reply({
        embeds: [buildProgressEmbed('🏓 Pong!', desc, pingSteps, 0, { footer: 'Open Arena' })],
        fetchReply: true
    });

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    const resultEmbed = buildResultEmbed(
        '🏓 Pong!',
        `📡 **Roundtrip Latency:** \`${latency}ms\`\n🌐 **API Latency:** \`${apiLatency}ms\``,
        { footer: 'Open Arena' }
    );

    await interaction.editReply({ embeds: [resultEmbed] });
}

// ─── /status ────────────────────────────────────────────────────────────

const statusSteps = [
    "📊 Initializing status monitor",
    "🌐 Pinging endpoints",
    "✅ Monitor ready",
];

export async function handleStatus(interaction) {
    await interaction.deferReply();
    const desc = '📡 Starting status monitoring...';
    await updateEmbed(interaction, '📊 Status Monitor', desc, statusSteps, 0, { footer: 'Open Arena' });

    startStatusInterval(interaction.client, interaction.channel);

    await updateEmbed(interaction, '📊 Status Monitor', desc, statusSteps, 1, { footer: 'Open Arena' });

    const resultEmbed = buildResultEmbed(
        '✅ Status Monitor Active',
        '📊 Status monitor initialized and pinging endpoints.\n\nUpdates will appear in this channel periodically.',
        { footer: 'Open Arena' }
    );

    await interaction.editReply({ embeds: [resultEmbed] });
}

// ─── /message ───────────────────────────────────────────────────────────

export async function handleMessage(interaction) {
    const resultEmbed = buildResultEmbed(
        '✅ Webhook Embed Sent',
        '📨 The embed has been delivered to the target channel.',
        { footer: 'Open Arena' }
    );
    await interaction.reply({ embeds: [resultEmbed], ephemeral: true });
}
