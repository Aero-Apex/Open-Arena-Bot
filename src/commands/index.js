// ============================================
// 🏟️ OPEN ARENA - Command Definitions
// All slash command definitions
// ============================================

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check if the bot is alive"),
    
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask the AI (NVIDIA Nemotron)")
        .addStringOption(o => o.setName("prompt").setDescription("Your question / prompt").setRequired(true))
        .addBooleanOption(o => o.setName("web_search").setDescription("Enable web search?").setRequired(false)),
    
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Check the status of connected services (Live Monitor)"),
    
    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Clear the bot's short-term memory in this channel"),
    
    new SlashCommandBuilder()
        .setName("rate")
        .setDescription("Rate an AI model (0-100)")
        .addStringOption(o => o.setName("model").setDescription("AI model name").setRequired(true).setMaxLength(100)),
    
    new SlashCommandBuilder()
        .setName("battle")
        .setDescription("Battle two AI models")
        .addStringOption(o => o.setName("model_a").setDescription("First model").setRequired(true).setMaxLength(100))
        .addStringOption(o => o.setName("model_b").setDescription("Second model").setRequired(true).setMaxLength(100)),
    
    new SlashCommandBuilder()
        .setName("generate")
        .setDescription("Generate an AI image using Davinci.ai")
        .addStringOption(o => o.setName("prompt").setDescription("Describe the image").setRequired(true))
        .addStringOption(o => o.setName("aspect").setDescription("Aspect ratio").setRequired(false)
            .addChoices({ name: '1:1', value: '1:1' }, { name: '9:16', value: '9:16' }, { name: '16:9', value: '16:9' }))
        .addStringOption(o => o.setName("model").setDescription("AI Model").setRequired(false)
            .addChoices(
                { name: 'GPT Image 2', value: 'GPT Image 2' }, 
                { name: 'Nano Banana 2', value: 'Nano Banana 2' }, 
                { name: 'Nano Banana Pro', value: 'Nano Banana Pro' }
            )),
    
    new SlashCommandBuilder()
        .setName("message")
        .setDescription("Send a formatted embed (Admin Only)")
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

export default commands;
