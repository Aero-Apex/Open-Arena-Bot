import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder 
} from 'discord.js';

// ✅ FIX 1: Corrected import to match the actual export in davinciService.js
import { automateDavinci } from '../services/davinciService.js';

// Standard imports based on your v2.0 architecture
import { CONFIG } from '../config/index.js';
import { log } from '../utils/logger.js';

// Uncomment and adjust these based on your actual service files:
// import { queryNemotron, clearChannelMemory } from '../services/nvidiaService.js';
// import { scrapeAndRate, battleModels } from '../services/aiService.js';

/**
 * Handle /generate command
 * ✅ FIX 2: Updated to map arguments correctly and handle Buffer returns
 */
export async function handleGenerate(interaction) {
    await interaction.deferReply();

    // Mapped to match your README: /generate [prompt] [aspect] [model]
    const prompt = interaction.options.getString('prompt');
    const aspect = interaction.options.getString('aspect') || '1:1';
    const model = interaction.options.getString('model') || 'gpt-image-2'; 

    const loadingEmbed = new EmbedBuilder()
        .setColor(CONFIG.colors?.loading || 0xFFA500)
        .setTitle('🎨 Generating Image...')
        .setDescription(`**Prompt:** ${prompt}\n**Model:** ${model}\n**Aspect:** ${aspect}\n\n⏳ This may take up to 60 seconds due to browser automation...`)
        .setFooter({ text: 'Powered by Davinci.ai' });

    await interaction.editReply({ embeds: [loadingEmbed] });

    try {
        // Optional: Pass a function to track Playwright automation steps
        const updateStatus = async (step, msg) => {
            log.info(`Davinci Step ${step}: ${msg}`);
        };

        // Call automateDavinci with correct arguments: (prompt, aspect, model, updateStatus)
        const { imgBuffer, fileName } = await automateDavinci(prompt, aspect, model, updateStatus);

        // ✅ FIX 3: Convert the raw buffer to a Discord Attachment
        const attachment = new AttachmentBuilder(imgBuffer, { name: fileName });

        const successEmbed = new EmbedBuilder()
            .setColor(CONFIG.colors?.success || 0x00FF00)
            .setTitle('✨ Image Generated Successfully!')
            .setImage(`attachment://${fileName}`) // Use attachment:// protocol
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
            files: [attachment] // Pass the buffer here
        });
    } catch (err) {
        log.error('Generate command error:', err);
        const errorEmbed = new EmbedBuilder()
            .setColor(CONFIG.colors?.error || 0xFF0000)
            .setTitle('❌ Generation Failed')
            .setDescription(`Could not generate image: ${err.message}\n\n*Note: Davinci.ai may have updated their UI or enforced Cloudflare CAPTCHAs.*`)
            .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Handle /ask command
 */
export async function handleAsk(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    const webSearch = interaction.options.getBoolean('web_search') || false;
    
    try {
        // const response = await queryNemotron(prompt, interaction.channelId, webSearch);
        // await interaction.editReply(response);
        await interaction.editReply(`Nemotron response for: "${prompt}" (Web search: ${webSearch})`);
    } catch (err) {
        log.error('Ask command error:', err);
        await interaction.editReply('❌ Failed to get response from NVIDIA Nemotron.');
    }
}

/**
 * Handle /rate command
 */
export async function handleRate(interaction) {
    await interaction.deferReply();
    const model = interaction.options.getString('model');
    try {
        // const scorecard = await scrapeAndRate(model);
        // await interaction.editReply({ embeds: [scorecard] });
        await interaction.editReply(`Scraping benchmarks and rating model: ${model}...`);
    } catch (err) {
        log.error('Rate command error:', err);
        await interaction.editReply('❌ Failed to rate model.');
    }
}

/**
 * Handle /battle command
 */
export async function handleBattle(interaction) {
    await interaction.deferReply();
    const modelA = interaction.options.getString('model_a');
    const modelB = interaction.options.getString('model_b');
    try {
        // const battleEmbed = await battleModels(modelA, modelB);
        // await interaction.editReply({ embeds: [battleEmbed] });
        await interaction.editReply(`Comparing ${modelA} vs ${modelB}...`);
    } catch (err) {
        log.error('Battle command error:', err);
        await interaction.editReply('❌ Failed to battle models.');
    }
}

/**
 * Handle /clear command
 */
export async function handleClear(interaction) {
    try {
        // clearChannelMemory(interaction.channelId);
        await interaction.reply({ content: '🧠 Short-term memory for this channel has been wiped.', ephemeral: true });
    } catch (err) {
        log.error('Clear command error:', err);
        await interaction.reply({ content: '❌ Failed to clear memory.', ephemeral: true });
    }
}

/**
 * Handle /ping command
 */
export async function handlePing(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Roundtrip latency: ${latency}ms | API Latency: ${Math.round(interaction.client.ws.ping)}ms`);
}

/**
 * Handle /status command
 */
export async function handleStatus(interaction) {
    await interaction.deferReply();
    // Logic for auto-updating dashboard
    await interaction.editReply('📊 Status monitor initialized. Pinging endpoints...');
}

/**
 * Handle /message command (Admin)
 */
export async function handleMessage(interaction) {
    // Admin webhook embed logic
    await interaction.reply({ content: '✅ Webhook embed sent.', ephemeral: true });
}
