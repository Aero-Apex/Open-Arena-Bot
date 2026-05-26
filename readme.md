

# 🏟️ OpenArena v2.0
### The Ultimate Multi-AI Discord Mega-Bot - Now Modular!

**OpenArena** is a powerful, all-in-one Discord bot that bridges the gap between direct API integrations and advanced web automation. It allows your server members to chat with top-tier AI models, generate premium AI images, benchmark LLMs, and manage server embeds—all from a single, unified interface.

---

## ✨ What It Does (Features)

### 🧠 Unified AI Chat (`/ask`)
Ask questions and get streaming, context-aware responses powered by **NVIDIA Nemotron**:
* **Ultra-fast API streaming** with built-in "Reasoning" thoughts
* **Optional live web search** via SearXNG integration
* **Context memory** - remembers last 10 messages per channel

### 🎨 Premium Image Generation (`/generate`)
Generate high-quality AI images using **Davinci.ai** (GPT Image 2, Nano Banana 2, Nano Banana Pro). 
* *How?* The bot automatically provisions a secure temporary email via Mail.tm, bypasses authentication, injects your prompt, and extracts the final image directly from the site's memory/network.

### ⚔️ AI Model Arena (`/rate` & `/battle`)
Don't just guess which AI is better—prove it. 
* Uses **SearXNG** to scrape live web benchmarks and community reviews.
* Uses **NVIDIA Nemotron** to analyze the data and output structured, visual scorecards and matchup summaries.

### 📡 Live Infrastructure Monitor (`/status`)
A real-time, auto-updating dashboard that pings your custom endpoints (like Open WebUI and SearXNG) and alerts the channel if a service goes offline.

### 🛠️ Admin Embed Builder (`/message`)
*(Admin Only)* Craft beautiful, complex Discord embeds with custom colors, webhooks, thumbnail/author icons, and intelligent `@mention` parsing.

---

## 📁 Project Structure (v2.0 Modular Architecture)

```
open-arena-bot/
├── src/                      # Main source directory
│   ├── index.js              # Bot entry point
│   ├── config/               # Configuration management
│   │   └── index.js          # Centralized CONFIG object
│   ├── handlers/             # Command & state handlers
│   │   ├── commandHandlers.js # All command handler functions
│   │   └── stateManager.js   # Cooldowns, history, caches
│   ├── services/             # External API services
│   │   ├── nvidiaService.js  # NVIDIA NIM API integration
│   │   └── davinciService.js # Davinci.ai browser automation
│   ├── commands/             # Slash command definitions
│   │   └── index.js          # All command builders
│   └── utils/                # Utility functions
│       ├── logger.js         # Centralized logging
│       └── helpers.js        # Common helper functions
├── .env                      # Environment variables (DO NOT COMMIT)
├── .gitignore                # Git ignore rules
├── package.json              # Dependencies & scripts
└── README.md                 # This file
```

### Benefits of Modular Architecture:
- ✅ **Easier maintenance** - Each feature is isolated in its own file
- ✅ **Better debugging** - Clear separation of concerns
- ✅ **Scalable** - Easy to add new commands or services
- ✅ **Team-friendly** - Multiple developers can work on different modules
- ✅ **Cleaner code** - No more 1000+ line monolithic files

---

## 🚀 Installation & Setup Tutorial

### Prerequisites
* **Node.js 18+** (Required for ES Modules and native `fetch` support)
* **Git**
* A Discord Bot Application with **Message Content**, **Server Members**, and **Presence** intents enabled in the [Developer Portal](https://discord.com/developers/applications).

### Step 1: Clone the Repository
```bash
git clone https://github.com/Aero-Apex/Open-Arena-Bot.git
cd Open-Arena-Bot
```

### Step 2: Install Dependencies
Install the required Node packages and the Playwright Chromium browser.
```bash
# Install Node modules
npm install

# Install Chromium for Playwright
npx playwright install chromium

# Install system dependencies for Chromium (Linux users only)
npx playwright install-deps chromium
```

### Step 3: Configure Environment Variables
Create a file named exactly `.env` in the root directory and add your credentials:

```env
# Discord Credentials (REQUIRED)
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here

# AI & Search APIs
NVIDIA_API_KEY=nvapi-your_nvidia_key_here
SEARXNG_URL=http://192.168.88.32:8080/search
STATUS_URL=https://openarena.eu.cc/
```

### Step 4: Run the Bot
```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```
*You should see `[INFO] Slash commands registered.` and `[INFO] Logged in as OpenArena#xxxx`.*

---

## 📜 Commands List

| Command | Description |
| :--- | :--- |
| `/ask [prompt] [web_search]` | Chat with NVIDIA Nemotron with optional web search |
| `/generate [prompt] [aspect] [model]` | Generate images via Davinci.ai (GPT Image 2, Nano Banana) |
| `/rate [model]` | Scrape the web and rate an AI model (0-100 scorecard) |
| `/battle [model_a] [model_b]` | Compare two AI models side-by-side using live benchmarks |
| `/status` | Start a live-updating monitor for your web services |
| `/clear` | Wipe the bot's short-term memory in the current channel |
| `/ping` | Check bot latency and gateway health |
| `/message [title] [text] ...` | **(Admin)** Send advanced webhook embeds with mention parsing |

*Note: The bot also responds to direct `@mentions` and DMs using the Nemotron engine!*

---

## ⚙️ Under the Hood

OpenArena v2.0 utilizes a hybrid architecture:

1. **ES Modules** - Modern JavaScript module system for cleaner imports/exports
2. **Direct API Streaming** - Uses native `fetch` and `ReadableStream` to connect to the NVIDIA NIM API, allowing for real-time token streaming and hidden "Chain of Thought" reasoning extraction.
3. **Playwright Stealth Automation** - For sites without public APIs (Davinci.ai), OpenArena spins up headless Chromium instances with network interceptors to catch image blobs and DOM observers to extract AI text responses while masking the `navigator.webdriver` flag.
4. **Temporary Email Routing** - Integrates with the Mail.tm API to generate burner inboxes, fetch 6-digit verification codes via regex, and authenticate into web portals on the fly.
5. **Context Memory** - Maintains a rolling 10-message history per channel/DM, allowing the AI to remember previous context during conversations.

---

## ⚠️ Important Caveats & Security

* **Web Automation Stability:** The `/generate` command relies on Playwright web scraping. If Davinci.ai updates their UI classes or implements strict Cloudflare Turnstile CAPTCHAs, the automation may require selector updates in `src/services/davinciService.js`.
* **Security:** **NEVER** commit your `.env` file to GitHub. The `.gitignore` file is pre-configured to hide your `.env` and `node_modules` folders. If you leak your `DISCORD_TOKEN`, malicious actors can take over your bot.
* **Rate Limits:** Playwright automations are resource-intensive. Running multiple `/generate` commands simultaneously on a low-RAM VPS may cause Chromium to crash.
* **Node.js Version:** This bot requires Node.js 18 or higher for ES Module support. Using an older version will result in syntax errors.

---

## 🔧 Development

### Adding New Commands
1. Add command definition in `src/commands/index.js`
2. Create handler function in `src/handlers/commandHandlers.js`
3. Export and map the handler in `src/index.js`

### Adding New Services
1. Create new service file in `src/services/`
2. Export functions using ES Module syntax
3. Import and use in command handlers

---

## 📄 License
MIT License - Built with ❤️ using Discord.js, Playwright, and NVIDIA NIM.

---

*Version 2.0 - Now with modular architecture for better maintainability and scalability!*
```

### 📝 How to add this to your GitHub:
1. Open your terminal where your project is located.
2. Create the file: `echo. > README.md` (Windows) or `touch README.md` (Linux/Mac).
3. Open `README.md` in your code editor (like VS Code), paste the code above, and save it.
4. Push it to GitHub:
   ```powershell
   git add README.md
   git commit -m "Add comprehensive README documentation"
   git push origin main
   ```
