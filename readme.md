

# 🏟️ OpenArena
### The Ultimate Multi-AI Discord Mega-Bot

**OpenArena** is a powerful, all-in-one Discord bot that bridges the gap between direct API integrations and advanced web automation. It allows your server members to chat with top-tier AI models, generate premium AI images, benchmark LLMs, and manage server embeds—all from a single, unified interface.

---

## ✨ What It Does (Features)

### 🧠 Unified AI Chat (`/ask`)
Ask questions and get streaming, context-aware responses. Choose your engine:
* **NVIDIA Nemotron:** Ultra-fast, direct API streaming with built-in "Reasoning" thoughts and optional live web search via SearXNG.
* **EaseMate Models:** Access premium models like **Claude 3 Haiku, Kimi K2.5, Gemini 3.0 Flash, Qwen3 235B,** and **Meta Llama 3.3** via stealth browser automation.

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

## ⚙️ How It Works (Under the Hood)

OpenArena is built on **Node.js** and utilizes a hybrid architecture:

1. **Direct API Streaming:** Uses native `fetch` and `ReadableStream` to connect to the NVIDIA NIM API, allowing for real-time token streaming and hidden "Chain of Thought" reasoning extraction.
2. **Playwright Stealth Automation:** For sites without public APIs (EaseMate, Davinci.ai), OpenArena spins up headless Chromium instances. It uses custom network interceptors to catch image blobs and DOM observers to extract AI text responses while masking the `navigator.webdriver` flag to bypass basic bot detection.
3. **Temporary Email Routing:** Integrates with the Mail.tm API to generate burner inboxes, fetch 6-digit verification codes via regex, and authenticate into web portals on the fly.
4. **Context Memory:** Maintains a rolling 10-message history per channel/DM, allowing the AI to remember previous context during conversations.

---

## 🚀 Installation & Setup Tutorial

### Prerequisites
* **Node.js 18+** (Required for native `fetch` support)
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
npm install discord.js dotenv axios playwright

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
node bot.js
```
*You should see `[INFO] Slash commands registered.` and `[INFO] Logged in as OpenArena#xxxx`.*

---

## 📜 Commands List

| Command | Description |
| :--- | :--- |
| `/ask [prompt] [model] [web_search]` | Chat with Nemotron (API) or EaseMate models (Playwright). |
| `/generate [prompt] [aspect] [model]` | Generate images via Davinci.ai (GPT Image 2, Nano Banana). |
| `/rate [model]` | Scrape the web and rate an AI model (0-100 scorecard). |
| `/battle [model_a] [model_b]` | Compare two AI models side-by-side using live benchmarks. |
| `/status` | Start a live-updating monitor for your web services. |
| `/clear` | Wipe the bot's short-term memory in the current channel. |
| `/ping` | Check bot latency and gateway health. |
| `/message [title] [text] ...` | **(Admin)** Send advanced webhook embeds with mention parsing. |

*Note: The bot also responds to direct `@mentions` and DMs using the Nemotron engine!*

---

## ⚠️ Important Caveats & Security

* **Web Automation Stability:** The `/generate` and EaseMate `/ask` models rely on Playwright web scraping. If Davinci.ai or EaseMate update their UI classes or implement strict Cloudflare Turnstile CAPTCHAs, those specific automations may require selector updates in the code.
* **Security:** **NEVER** commit your `.env` file to GitHub. The `.gitignore` file is pre-configured to hide your `.env` and `node_modules` folders. If you leak your `DISCORD_TOKEN`, malicious actors can take over your bot.
* **Rate Limits:** Playwright automations are resource-intensive. Running multiple `/generate` commands simultaneously on a low-RAM VPS may cause Chromium to crash.

---
*Built with ❤️ using Discord.js, Playwright, and NVIDIA NIM.*
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
