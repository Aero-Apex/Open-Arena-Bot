# Changelog

All notable changes to the OpenArena Discord Bot project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2024-XX-XX

### 🚀 New Feature: EaseMate GPT-5.5 Integration
- **`/ask` now accepts a `model` option**: Users can choose between `NVIDIA Nemotron` (default) and `EaseMate GPT-5.5`.
- **`src/services/easemateService.js`**: Full browser automation service for [EaseMate.ai](https://www.easemate.ai). Handles account signup via mail.tm, Cloudflare Turnstile bypass (Anti-Captcha or Capsolver), GPT-5.5 model selection, prompt submission, and response extraction.
- **Session persistence**: Cookies saved to `./sessions/easemate_cookies.json`. Single account reused across commands; auto-re-signup if session expires.
- **Singleton browser**: Shared Playwright instance across all `/ask` calls, closed gracefully on bot shutdown.
- **Dual solver support**: `ANTICAPTCHA_API_KEY` (via `@antiadmin/anticaptchaofficial`) or `CAPSOLVER_API_KEY` (via HTTP API). Feature disabled with a clear error if neither is set.

### 📦 Dependencies
- Added `@antiadmin/anticaptchaofficial` for Turnstile solving.

### 🔧 Maintenance
- Updated `src/index.js` shutdown handler to also close EaseMate browser.
- Updated `.gitignore` to exclude `sessions/` directory.

### 📚 Documentation
- README updated with EaseMate feature description, env var table, and architecture diagram.
- CHANGELOG updated for v2.1.0.

---

## [2.0.1] - 2024-XX-XX

### 🐛 Fixed
- **Crash on `/generate` and other commands**: Missing `cooldowns` config caused `TypeError: Cannot read properties of undefined (reading 'defaultSeconds')` in `getCooldownSeconds()`. Added cooldown configuration with sensible defaults.
- **Missing command mappings in cooldown lookup**: Refactored `getCooldownSeconds()` to use an explicit object map covering all commands instead of a sparse switch statement.
- **18 missing config properties**: The config object was missing entire sections (`nvidia`, `searxng`, `memory`, `colors`, `discordLimits`, `typing`) that all runtime code depended on. Added every missing path with sensible defaults.
- **Unhandled interaction errors**: Wrapped the `InteractionCreate` handler in a global try/catch with user-friendly error replies and logging, preventing crashes from bubbling up to the `unhandledRejection` handler.
- **Hardcoded color values**: Replaced inline `0xFF0000` error colors with centralized `CONFIG.colors.*` references.
- **`.gitignore` broken format**: Removed stray triple-backtick delimiter that invalidated the file.
- **Missing CLIENT_ID check**: Added a warning when `CLIENT_ID` is not set, skipping command registration instead of crashing.

### 🚀 Upgrades
- **Config overhaul**: Restructured `src/config/index.js` into clean namespaces matching runtime expectations (`nvidia.*`, `searxng.*`, `memory.*`, `colors.*`, `discordLimits.*`, `typing.*`). Added `NVIDIA_BASE_URL` and `NVIDIA_MODEL` env var overrides.
- **Global error handling**: Added `process.on("unhandledRejection")` and `process.on("SIGTERM")` handlers alongside the existing `SIGINT` handler.
- **Optional dependencies cleaned**: Removed unused Discord.js imports from `src/index.js` (`PermissionFlagsBits`, `EmbedBuilder`, `ActionRowBuilder`, `ButtonBuilder`, `ButtonStyle`).
- **`.env.example` updated**: Added documentation for all new environment variables with clear required/optional indicators.
- **`LICENSE.md`**: Added MIT license file.

### 📚 Documentation
- **README.md redesigned**: Added shields/badges, feature table, architecture diagram (ASCII), configuration reference, and better-organized sections.

---

## [2.0.0] - 2024-XX-XX

### 🚀 Major Architectural Overhaul
- **Modular Structure**: Completely refactored from a single monolithic `index.js` file into a scalable, multi-file directory structure.
- **ES Modules**: Migrated to modern ES Module syntax (`import`/`export`) for better dependency management and tree-shaking.
- **Separation of Concerns**:
  - `config/`: Centralized configuration and environment validation.
  - `handlers/`: Dedicated logic for loading commands and events.
  - `services/`: Isolated business logic for external APIs (NVIDIA, Davinci.ai).
  - `commands/`: Individual command files for easier maintenance.
  - `utils/`: Reusable helper functions and constants.

### 🎨 UI & User Experience Upgrades
- **Enhanced Embeds**: Redesigned all Discord embeds with better color schemes, thumbnails, and footer information.
- **Streaming Responses**: Implemented streaming progress indicators for long-running AI generation tasks.
- **Error Handling**: User-friendly error messages with detailed developer logs instead of raw crash outputs.
- **Loading States**: Added interactive "thinking" states while waiting for API responses.

### ⚡ Performance & Reliability
- **State Management**: Introduced a dedicated state manager for handling cooldowns, command history, and caching.
- **Rate Limiting**: Built-in rate limit handling for external API calls to prevent bans.
- **Graceful Shutdowns**: Improved process termination handling to save state before exiting.
- **Input Validation**: Strict validation for user inputs before processing to prevent injection attacks.

### 📚 Documentation
- **README.md**: Completely rewritten with installation guides, configuration details, and usage examples.
- **Code Comments**: Added JSDoc comments and inline explanations for complex logic.
- **.env.example**: Provided a template for environment variables with descriptions.

### 🛠️ Developer Experience
- **Hot Reloading Support**: Structure now supports easy implementation of command hot-reloading.
- **Scalability**: New commands can be added by simply dropping a file into the `commands/` folder.
- **Testing Ready**: Decoupled services make unit testing significantly easier.

### 📂 New File Structure
```text
openarena-bot/
├── config/
│   ├── index.js
│   └── validators.js
├── handlers/
│   ├── commandHandler.js
│   └── eventHandler.js
├── services/
│   ├── aiService.js
│   └── nvidiaService.js
├── commands/
│   ├── generate.js
│   ├── help.js
│   └── ping.js
├── utils/
│   ├── logger.js
│   └── helpers.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

### 🔒 Security
- **Environment Variables**: Enforced usage of `.env` for all sensitive keys; no hardcoded secrets.
- **Input Sanitization**: Added sanitization layers for all user-provided arguments.

---

## [1.0.0] - 2024-XX-XX

### Initial Release
- Monolithic `index.js` implementation.
- Basic command handling.
- Simple text-based responses.
- Minimal error handling.
- Hardcoded configuration values.
