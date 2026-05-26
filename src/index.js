// ============================================
// 🏟️ OPEN ARENA - Main Entry Point
// Ultimate AI Discord Bot
// Features: NVIDIA Nemotron, SearXNG, Davinci Images, Admin Embeds
// ============================================

import { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    Events, 
    PermissionFlagsBits, 
    ActivityType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";
import CONFIG from './config/index.js';
import log from './utils/logger.js';
import { commands } from './commands/index.js';
import {
    handlePing,
    handleClear,
    handleAsk,
    handleStatus,
    handleRate,
    handleBattle,
    handleGenerate,
    handleMessage
} from './handlers/commandHandlers.js';
import { 
    checkCooldown, 
    getCooldownSeconds, 
    getHistory, 
    addToHistory,
    startCleanupInterval,
    stopAllStatusIntervals
} from './handlers/stateManager.js';
import { askLLM, searchSearXNG } from './services/nvidiaService.js';
import { splitIntoChunks, keepTyping } from './utils/helpers.js';

// Command handlers map
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

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Ready event
client.once(Events.ClientReady, async () => {
    log.info(`Logged in as ${client.user.tag}`);
    client.user.setActivity({ 
        name: "with electrons | /ask", 
        type: ActivityType.Playing 
    });
    
    const rest = new REST({ version: "10" }).setToken(CONFIG.discord.token);
    
    try {
        log.info("Registering slash commands…");
        const route = CONFIG.discord.guildId 
            ? Routes.applicationGuildCommands(CONFIG.discord.clientId, CONFIG.discord.guildId) 
            : Routes.applicationCommands(CONFIG.discord.clientId);
        
        await rest.put(route, { body: commands });
        log.info("Slash commands registered.");
    } catch (err) { 
        log.error("Failed to register commands:", err); 
    }
    
    // Start cleanup interval
    startCleanupInterval();
});

// Message event (for mentions and DMs)
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    
    const isDM = !message.guild;
    const explicitMentionRegex = new RegExp(`<@!?${client.user.id}>`);
    const isStrictMention = explicitMentionRegex.test(message.content);
    
    if (!isDM && !isStrictMention) return;
    
    const remaining = checkCooldown(message.author.id, "ask", getCooldownSeconds("ask"));
    if (remaining > 0) {
        return message.reply(`⏳ Slow down! Try again in **${remaining}s**.`);
    }
    
    const userText = isDM 
        ? message.content.trim() 
        : message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
    
    if (!userText) {
        return message.reply("Hey! Ask me a question!");
    }
    
    const typing = keepTyping(message.channel);
    
    try {
        addToHistory(message.channel.id, "user", userText);
        const history = getHistory(message.channel.id);
        const llmMessages = [{ role: "system", content: CONFIG.bot.systemPrompt }, ...history];
        
        const sentMessage = await message.reply("⏳ *Thinking...*");
        let lastEdit = Date.now();
        
        const onProgress = (reasoning, content) => {
            if (Date.now() - lastEdit < 1500) return;
            lastEdit = Date.now();
            
            let liveMsg = "";
            if (reasoning.trim()) {
                liveMsg += `> **🧠 Thinking...**\n> \`\`\`${reasoning.trim().slice(-200).replace(/\n/g, ' ')}\`\`\`\n`;
            }
            if (content.trim()) {
                liveMsg += content.trim();
            }
            if (!liveMsg) {
                liveMsg = "⏳ *The model is thinking...*";
            }
            
            sentMessage.edit(liveMsg.slice(0, 1980)).catch(() => {});
        };
        
        const { reasoning, content } = await askLLM(llmMessages, onProgress);
        const finalFormatted = (reasoning 
            ? `||🤔 **Thinking:** ${reasoning.trim().slice(0, 800)}||\n` 
            : "") + content;
        
        addToHistory(message.channel.id, "assistant", content);
        const chunks = splitIntoChunks(finalFormatted);
        
        await sentMessage.edit(chunks[0]).catch(() => {});
        for (const chunk of chunks.slice(1)) {
            await message.channel.send(chunk);
        }
    } catch (err) { 
        await message.reply(`Something went wrong: ${err.message}`.slice(0, 2000)); 
    } finally { 
        typing.stop(); 
    }
});

// Interaction event
client.on(Events.InteractionCreate, async (interaction) => {
    // Button interactions
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('regen_')) {
            return interaction.reply({ 
                content: '💡 To regenerate, simply use the `/generate` command again!', 
                ephemeral: true 
            });
        }
        return;
    }
    
    // Command interactions
    if (!interaction.isChatInputCommand()) return;
    
    log.command(interaction.commandName, interaction.user, interaction.guild);
    
    const handler = commandHandlers[interaction.commandName];
    if (!handler) return;
    
    const cooldownSecs = getCooldownSeconds(interaction.commandName);
    const remaining = checkCooldown(interaction.user.id, interaction.commandName, cooldownSecs);
    
    if (remaining > 0 && 
        interaction.commandName !== "status" && 
        interaction.commandName !== "message") {
        return interaction.reply({ 
            content: `⏳ Slow down! Try again in **${remaining}s**.`, 
            ephemeral: true 
        });
    }
    
    await handler(interaction);
});

// Graceful shutdown
process.on("SIGINT", () => {
    log.info("Shutting down...");
    stopAllStatusIntervals();
    client.destroy();
    process.exit(0);
});

// Login
client.login(CONFIG.discord.token);

export default client;
