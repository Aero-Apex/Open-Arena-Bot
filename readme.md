<div align="center">

# 🏟️ Open Arena Bot

**The Ultimate Multi-AI Discord Bot**  
Powered by **NVIDIA Nemotron · SearXNG · Davinci.ai**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)](https://discord.js.org)

---

</div>

## ✨ Features

| Command | Description |
|---|---|
| `/ask` | Ask NVIDIA Nemotron with optional web search |
| `/generate` | Generate AI images via Davinci.ai browser automation |
| `/rate` | Research & rate any AI model (0–100) using live web data |
| `/battle` | Pit two AI models head-to-head with web-sourced analysis |
| `/status` | Start a live service monitor with periodic updates |
| `/clear` | Wipe the bot's short-term memory per channel |
| `/ping` | Check bot latency |
| `/message` | Send admin-only formatted embeds |

## 📋 Prerequisites

- **Node.js** ≥ 18.0.0
- **NVIDIA API Key** — get one at [build.nvidia.com](https://build.nvidia.com)
- **Discord Bot Token** — created via [Discord Developer Portal](https://discord.com/developers/applications) with `applications.commands` scope
- **SearXNG instance** — self-hosted or community instance
- **Playwright Chromium** — for Davinci.ai image generation

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Aero-Apex/Open-Arena-Bot.git
cd Open-Arena-Bot

# Install dependencies
npm install

# Install Playwright browser for image generation
npx playwright install chromium

# Configure environment
cp .env.example .env
# Then edit .env with your tokens
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_TOKEN` | ✅ Yes | — | Discord bot token |
| `CLIENT_ID` | ✅ Yes | — | Discord application ID |
| `GUILD_ID` | ❌ No | — | Restrict commands to one guild |
| `NVIDIA_API_KEY` | ✅ Yes | — | NVIDIA Nemotron API key |
| `NVIDIA_BASE_URL` | ❌ No | `https://integrate.api.nvidia.com/v1` | Custom API endpoint |
| `NVIDIA_MODEL` | ❌ No | `nvidia/llama-3.1-nemotron-70b-instruct` | Override model |
| `SEARXNG_URL` | ❌ No | `http://192.168.88.32:8080/search` | SearXNG instance |
| `STATUS_URL` | ❌ No | `https://openarena.eu.cc/` | Status monitor target |
| `DEBUG` | ❌ No | `false` | Enable debug logging |

## 🎮 Usage

```bash
npm start        # Production
npm run dev      # Development with file watching
```

## 📁 Project Structure

```
src/
├── index.js                   # Entry point & event wiring
├── config/
│   └── index.js               # Centralized configuration
├── commands/
│   └── index.js               # Slash command definitions
├── handlers/
│   ├── commandHandlers.js      # Command business logic
│   └── stateManager.js         # Cooldowns, caches, chat history
├── services/
│   ├── nvidiaService.js        # NVIDIA Nemotron LLM + SearXNG search
│   └── davinciService.js       # Davinci.ai browser automation
└── utils/
    ├── logger.js               # Structured logging
    └── helpers.js              # Text splitting, JSON parsing, typing
```

## ⚙️ Configuration

All tuning lives in `src/config/index.js`:

| Section | Key | Default | Purpose |
|---|---|---|---|
| `nvidia` | `temperature` | `0.5` | LLM response creativity |
| `nvidia` | `topP` | `0.9` | Nucleus sampling |
| `nvidia` | `maxTokens` | `1024` | Max response length |
| `searxng` | `maxResults` | `5` | Search results per query |
| `cooldowns` | `defaultSeconds` | `10` | Default command cooldown |
| `memory` | `maxMessages` | `20` | Chat history per channel |
| `typing` | `intervalMs` | `5000` | Typing indicator interval |
| `colors` | `primary` | `0x5865F2` | Embed accent color |

## 🧠 Architecture

```
Discord ──► Gateway Intents
                │
        InteractionCreate / MessageCreate
                │
        ┌───────┴───────┐
        │               │
                                                      Command Map     Cooldown Check
                                                      │               │
                                                commandHandlers   stateManager
                                                      │               │
                                                 ┌────┼────┐      chatHistory
                                                 │    │    │      ratingCache
                                              nvidia  │  davinci
                                             Service  │  Service
                                                 │    │    │
                                              SearXNG │  Playwright
 ```

## 🤝 Contributing

Issues and pull requests are welcome. See [CONTRIBUTING](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT](LICENSE.md) — Copyright (c) 2024 OpenArena Team
