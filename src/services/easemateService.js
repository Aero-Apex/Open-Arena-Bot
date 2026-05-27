import { chromium } from "playwright";
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import path from "path";
import CONFIG from "../config/index.js";
import log from "../utils/logger.js";

const MAILTM_BASE = "https://api.mail.tm";
const SESSION_PATH = path.resolve(CONFIG.easemate.sessionDir, "easemate_cookies.json");
const USAGE_PATH = path.resolve(CONFIG.easemate.sessionDir, "easemate_usage.json");
const MAX_USES = 2;

function generatePassword(length = 6) {
    return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── mail.tm helpers ────────────────────────────────────────────────────

async function getMailtmDomain() {
    try {
        const r = await axios.get(`${MAILTM_BASE}/domains`, { timeout: 10000 });
        const domains = r.data["hydra:member"] || [];
        if (domains.length > 0) return domains[0].domain;
    } catch (e) {
        log.warn("[EaseMate] Failed to get mail.tm domain:", e.message);
    }
    return null;
}

async function createMailtmAccount() {
    const domain = await getMailtmDomain();
    if (!domain) throw new Error("Mail.tm unreachable.");
    const email = `${crypto.randomBytes(5).toString("hex")}@${domain}`;
    const password = generatePassword(10);
    await axios.post(`${MAILTM_BASE}/accounts`, { address: email, password }, { timeout: 10000 });
    return { email, password };
}

async function getMailtmToken(email, password) {
    const r = await axios.post(`${MAILTM_BASE}/token`, { address: email, password }, { timeout: 10000 });
    return r.data.token;
}

async function getLatestEmailCode(token) {
    const headers = { Authorization: `Bearer ${token}` };

    for (let i = 0; i < 30; i++) {
        try {
            const r = await axios.get(`${MAILTM_BASE}/messages`, { headers, timeout: 10000 });
            const messages = r.data["hydra:member"] || [];
            log.info(`[EaseMate] Mail.tm polling ${i + 1}/30: ${messages.length} messages`);

            if (messages.length > 0) {
                const r2 = await axios.get(`${MAILTM_BASE}/messages/${messages[0].id}`, { headers });

                // Gather all text content from the email
                const textParts = [];
                if (r2.data.subject) textParts.push(r2.data.subject);
                if (r2.data.text) textParts.push(r2.data.text);
                if (Array.isArray(r2.data.html)) {
                    for (const h of r2.data.html) {
                        if (typeof h === "string") textParts.push(h);
                    }
                }
                if (r2.data.html && typeof r2.data.html === "string") {
                    textParts.push(r2.data.html);
                }

                const allText = textParts.join(" ");
                log.info(`[EaseMate] Email subject: ${r2.data.subject || "(none)"}`);

                // Try common code formats: 4-8 digit codes
                const patterns = [/\b(\d{6})\b/, /\b(\d{4})\b/, /\b(\d{8})\b/];
                for (const pat of patterns) {
                    const match = allText.match(pat);
                    if (match) return match[1];
                }

                log.warn("[EaseMate] Email found but no code matched, text preview:", allText.slice(0, 200));
            }
        } catch (e) {
            log.warn("[EaseMate] Error fetching email:", e.message);
        }
        await sleep(4000);
    }

    throw new Error("Verification email never arrived.");
}

// ─── Turnstile bypass (free: mock + real widget interaction) ────────────

const MOCK_TURNSTILE = `
window.turnstile = window.turnstile || {
    render: function(a, b) {
        var id = 'mock-widget-' + Math.random().toString(36).slice(2);
        if (b && b.callback) setTimeout(function() { b.callback('MOCK_TOKEN_' + Date.now()); }, 100);
        return id;
    },
    execute: function(a, b) {
        if (b && b.callback) setTimeout(function() { b.callback('MOCK_TOKEN_' + Date.now()); }, 100);
    },
    getResponse: function() { return 'MOCK_TOKEN_' + Date.now(); },
    reset: function() {},
    remove: function() {},
    ready: function(fn) { if (fn) setTimeout(fn, 50); }
};
`;

async function setupTurnstileBypass() {
    // Inject a mock BEFORE page scripts run, but DON'T block the CDN
    // The mock acts as fallback if real Turnstile fails to load
    await context.addInitScript(MOCK_TURNSTILE);
    log.info("[EaseMate] Turnstile fallback mock injected");
}

async function tryClickTurnstileWidget() {
    try {
        const frame = await page.$('iframe[src*="turnstile"]');
        if (frame) {
            log.info("[EaseMate] Found Turnstile iframe, trying to click...");
            const box = await frame.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(1500);
                return true;
            }
        }

        const widget = await page.$('[class*="turnstile"], [class*="cf-turnstile"], #cf-turnstile');
        if (widget) {
            log.info("[EaseMate] Found Turnstile widget, trying force-click...");
            await widget.click({ force: true, timeout: 3000 });
            await page.waitForTimeout(1500);
            return true;
        }
    } catch (e) {
        log.warn("[EaseMate] Turnstile widget click failed (non-visible, mock will handle):", e.message);
    }
    return false;
}

// ─── Browser & session management ──────────────────────────────────────

let browser = null;
let context = null;
let page = null;
let _account = null;
let _onProgress = null;

export function getAccountEmail() {
    return _account?.email || "unknown";
}

function ensureSessionDir() {
    const dir = path.dirname(SESSION_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function saveCookies() {
    if (!context) return;
    ensureSessionDir();
    context.cookies().then((cookies) => {
        fs.writeFileSync(SESSION_PATH, JSON.stringify(cookies, null, 2), "utf-8");
    }).catch(() => {});
}

async function loadCookies(ctx) {
    if (!fs.existsSync(SESSION_PATH)) return false;
    try {
        const usage = loadUsageCount();
        if (usage >= MAX_USES) {
            log.info(`[EaseMate] Session used ${usage}/${MAX_USES} times, expiring...`);
            await destroySession();
            return false;
        }

        const cookies = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
        if (!Array.isArray(cookies) || cookies.length === 0) return false;
        await ctx.addCookies(cookies);
        log.info("[EaseMate] Session cookies loaded");
        return true;
    } catch {
        return false;
    }
}

async function destroySession() {
    if (fs.existsSync(SESSION_PATH)) fs.unlinkSync(SESSION_PATH);
    if (fs.existsSync(USAGE_PATH)) fs.unlinkSync(USAGE_PATH);
    _account = null;
}

function loadUsageCount() {
    try {
        if (fs.existsSync(USAGE_PATH)) {
            const data = JSON.parse(fs.readFileSync(USAGE_PATH, "utf-8"));
            return data.count || 0;
        }
    } catch {}
    return 0;
}

function incrementUsageCount() {
    try {
        ensureSessionDir();
        const count = loadUsageCount() + 1;
        fs.writeFileSync(USAGE_PATH, JSON.stringify({ count }, null, 2), "utf-8");
        log.info(`[EaseMate] Session use ${count}/${MAX_USES}`);
        return count;
    } catch {}
    return 0;
}

function resetUsageCount() {
    try {
        if (fs.existsSync(USAGE_PATH)) fs.unlinkSync(USAGE_PATH);
    } catch {}
}

function updateProgress(msg) {
    if (_onProgress) _onProgress(msg);
    log.info(`[EaseMate] ${msg}`);
}

async function initBrowser() {
    if (browser && browser.isConnected()) return;

    browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    });

    context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    page = await context.newPage();
    page.on("crash", () => {});
    page.on("close", () => {});

    await setupTurnstileBypass();

    log.info("[EaseMate] Browser launched");
}

async function navigateToChat() {
    await page.goto(CONFIG.easemate.url, { waitUntil: "networkidle", timeout: 45000 });
}

async function isLoggedIn() {
    return page.evaluate(() => {
        const spans = document.querySelectorAll("span");
        for (const s of spans) {
            if (s.textContent?.trim() === "Log In") return false;
        }
        // Also check if we see chat elements
        return document.querySelector("textarea, div[contenteditable='true'], div[role='textbox']") !== null;
    }).catch(() => false);
}

async function dismissModals() {
    try {
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press("Escape");
            await page.waitForTimeout(300);
        }

        const closeSelectors = [
            "[class*='ant-modal-close']",
            "[class*='modal-close']",
            "[class*='close-btn']",
            "[aria-label='Close']",
            "button:has-text('Close')",
            "button:has-text('Skip')",
            "button:has-text('Got it')",
            "button:has-text('OK')",
            "button:has-text('Maybe later')",
            "button:has-text('Start')",
            "button:has-text('Continue')",
            "button:has-text('Get started')",
        ];
        for (const sel of closeSelectors) {
            const btns = await page.$$(sel);
            for (const btn of btns) {
                try { await btn.click({ force: true, timeout: 2000 }); await page.waitForTimeout(400); } catch {}
            }
        }

        await page.evaluate(() => {
            document.querySelectorAll(
                "[class*='ant-modal-wrap'], [class*='ant-modal-mask']"
            ).forEach(el => el.remove());

            document.querySelectorAll("div").forEach(el => {
                const z = parseInt(window.getComputedStyle(el).zIndex);
                const pos = window.getComputedStyle(el).position;
                if ((pos === 'fixed' || pos === 'absolute') && (z >= 1000 || el.getAttribute('role') === 'dialog')) {
                    if (!el.closest('textarea') && !el.closest('input') && !el.closest('[contenteditable]')) {
                        el.style.display = 'none';
                    }
                }
            });
        });

        await page.waitForTimeout(1000);
    } catch (e) {
        log.warn("[EaseMate] dismissModals error:", e.message);
    }
}

// ─── Signup flow ────────────────────────────────────────────────────────

async function signup() {
    updateProgress("Creating temporary email...");

    const account = await createMailtmAccount();
    _account = account;
    const sitePassword = generatePassword(8);
    const mailToken = await getMailtmToken(account.email, account.password);

    updateProgress("Navigating to EaseMate...");
    await navigateToChat();
    await page.waitForTimeout(3000);

    // Modal navigation
    updateProgress("Opening signup form...");
    const modalSteps = [
        "span:has-text('Log In')",
        "span:has-text('Continue with Email')",
        "a:has-text('Sign up now')",
    ];
    for (const sel of modalSteps) {
        try {
            await safeClick(sel, 8000);
            await page.waitForTimeout(2000);
        } catch (e) {
            log.warn(`[EaseMate] Modal step skipped (${sel}): ${e.message}`);
        }
    }

    await page.waitForTimeout(1000);

    // Fill form
    updateProgress("Filling signup form...");
    try {
        await safeFill("#form_item_email", account.email);
        await safeFill("#form_item_password", sitePassword);
    } catch (e) {
        throw new Error(`Could not fill signup form: ${e.message}`);
    }

    // Try to interact with real Turnstile widget, fallback to mock
    await page.waitForTimeout(1000);
    await tryClickTurnstileWidget();
    await page.waitForTimeout(1000);

    updateProgress("Creating account...");
    await safeClick("button:has-text('Create Account')", 10000);
    await page.waitForTimeout(4000);

    // Detect which page we landed on after signup attempt
    const pageState = await page.evaluate(() => {
        const digitInputs = document.querySelectorAll('input[aria-label*="Digit"], input[placeholder*="code"], input[placeholder*="Code"]');
        if (digitInputs.length > 0) return "verify";

        const chatInputs = document.querySelectorAll("textarea, div[contenteditable='true'], div[role='textbox']");
        if (chatInputs.length > 0) return "chat";

        const spans = document.querySelectorAll("span");
        for (const s of spans) {
            if (s.textContent?.trim() === "Log In") return "login";
        }

        return "unknown";
    }).catch(() => "unknown");

    log.info(`[EaseMate] Post-signup page state: ${pageState}`);

    if (pageState === "verify") {
        updateProgress("Waiting for verification email...");
        const code = await getLatestEmailCode(mailToken);
        updateProgress("Entering verification code...");

        for (let i = 0; i < 6 && i < code.length; i++) {
            try {
                const input = await page.waitForSelector(`input[aria-label='Digit ${i + 1}']`, { timeout: 3000 });
                await input.fill(code[i]);
            } catch {
                const inputs = await page.$$("input[type='text']");
                if (inputs.length > i && inputs[i]) {
                    await inputs[i].fill(code[i]);
                }
            }
            await page.waitForTimeout(150);
        }

        if (code.length <= 6) {
            await page.keyboard.press("Enter");
        }

        await page.waitForTimeout(3000);

        updateProgress("Setting up GPT-5.5...");
        await navigateToChat();
        await page.waitForTimeout(3000);
    } else if (pageState === "chat") {
        updateProgress("Account created without verification!");
    } else if (pageState === "login") {
        // Account creation failed, try to detect error
        const pageText = await page.evaluate(() => document.body?.innerText?.trim() || "").catch(() => "");
        const errorText = pageText.split("\n").filter(l => l.length > 3).slice(0, 5).join(" ").slice(0, 500);
        throw new Error(`Account creation failed. Page shows: ${errorText}`);
    } else {
        // Unknown state — screenshot and continue optimistically
        try {
            await page.screenshot({ path: `easemate_debug_${Date.now()}.png`, fullPage: true });
            log.info("[EaseMate] Debug screenshot saved");
        } catch {}
        updateProgress("Continuing after signup...");
        await navigateToChat();
        await page.waitForTimeout(3000);
    }

    await dismissModals();
    await selectGpt55();
    saveCookies();
    updateProgress("Account ready!");
}

async function safeClick(selector, timeout = 10000) {
    const el = await page.waitForSelector(selector, { timeout });
    if (!el) throw new Error(`Element not found: ${selector}`);
    await el.click();
}

async function safeFill(selector, value) {
    const el = await page.waitForSelector(selector, { timeout: 10000 });
    if (!el) throw new Error(`Input not found: ${selector}`);
    await el.fill(value);
}

async function selectGpt55() {
    try {
        const modelTrigger = await page.waitForSelector("span:has-text('Gemini 2.0 Flash')", { timeout: 8000 });
        await modelTrigger.hover();
        await page.waitForTimeout(1000);
        await modelTrigger.click();
        await page.waitForTimeout(1500);

        let gpt55 = await page.$("span:text-is('GPT-5.5')");
        if (!gpt55) {
            const all = await page.$$("span:has-text('GPT-5.5')");
            for (const el of all) {
                const text = await el.textContent();
                if (text?.trim() === "GPT-5.5") { gpt55 = el; break; }
            }
        }
        if (!gpt55) {
            const all = await page.$$("div:has-text('GPT-5.5'), li:has-text('GPT-5.5')");
            for (const el of all) {
                const text = await el.textContent();
                if (text?.trim() === "GPT-5.5") { gpt55 = el; break; }
            }
        }
        if (!gpt55) throw new Error("GPT-5.5 option not found");

        try { await gpt55.click({ timeout: 3000 }); }
        catch { await gpt55.evaluate(el => el.parentElement?.click() || el.click()); }

        await page.waitForTimeout(1500);
        log.info("[EaseMate] Model set to GPT-5.5");
    } catch (e) {
        log.warn("[EaseMate] Model selection issue:", e.message);
    }
}

// ─── Ask flow ──────────────────────────────────────────────────────────

async function sendPrompt(text) {
    const selectors = [
        "textarea",
        "div[contenteditable='true']",
        "div[role='textbox']",
        "input[placeholder*='message']",
        "input[placeholder*='ask']",
    ];

    let input = null;
    for (const sel of selectors) {
        input = await page.$(sel);
        if (input) break;
    }

    if (!input) {
        const all = await page.$$("input, textarea, div[contenteditable]");
        for (const el of all) {
            const box = await el.boundingBox();
            if (box && box.width > 200) { input = el; break; }
        }
    }

    if (!input) throw new Error("Could not find chat input field");

    const isEditable = await input.evaluate((el) => el.isContentEditable);
    const tag = await input.evaluate((el) => el.tagName.toLowerCase());

    if (isEditable || tag === "div") {
        await input.click();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);
        await input.focus();
        for (const char of text) {
            await page.keyboard.type(char, { delay: 3 });
        }
    } else {
        await input.fill(text);
    }

    await page.waitForTimeout(500);

    const sendBtns = [
        "button[type='submit']",
        "svg[aria-label='Send']",
        "button:has(svg)",
        "button:has-text('Send')",
    ];

    let sent = false;
    for (const sel of sendBtns) {
        const btn = await page.$(sel);
        if (btn) { try { await btn.click({ force: true, timeout: 3000 }); sent = true; break; } catch {} }
    }

    if (!sent) {
        if (tag === "textarea") await page.keyboard.press("Enter");
        else await page.keyboard.press("ControlOrMeta+Enter");
    }
}

async function extractResponse() {
    const maxWait = 120000;
    const start = Date.now();
    let last = "";
    let stable = 0;

    while (Date.now() - start < maxWait) {
        const text = await page.evaluate(() => {
            const patterns = [
                '[class*="message"]:not([class*="user"]):not([class*="you"]):not([class*="User"])',
                '[class*="assistant"]', '[class*="Assistant"]',
                '[class*="bot"]', '[class*="Bot"]',
                '[class*="response"]', '[class*="Response"]',
                '[class*="chat-msg"]', '[class*="chat-message"]',
                '[class*="message-content"]', '[class*="msg-content"]',
                '[class*="ai-message"]', '[class*="answer"]',
                '[class*="markdown"]', '[class*="Markdown"]',
                '[class*="text-content"]', '[class*="content-text"]',
                '[class*="content"] p', '[class*="content"] div:not([class*="input"]):not([class*="user"])',
            ];

            for (const sel of patterns) {
                const els = document.querySelectorAll(sel);
                if (els.length === 0) continue;
                const lastEl = els[els.length - 1];
                const t = lastEl.textContent?.trim() || "";
                if (t.length >= 10 && !t.includes("Typing") && !t.includes("typing")) {
                    return t;
                }
            }

            const all = document.body?.innerText || "";
            const lines = all.split("\n").map(l => l.trim()).filter(l => l.length > 30);
            if (lines.length > 0) return lines[lines.length - 1];
            return "";
        });

        if (text && text !== last) {
            last = text;
            stable = 0;
        } else if (text && text === last) {
            stable++;
        }

        if (stable >= 3 && text.length > 0) return text;
        await sleep(1000);
    }

    if (last) return last;
    throw new Error("EaseMate did not return a response within the timeout");
}

// ─── Public API ────────────────────────────────────────────────────────

export async function askEaseMate(prompt, onProgress) {
    _onProgress = onProgress;

    await initBrowser();

    const hasCookies = await loadCookies(context);
    if (!hasCookies) {
        resetUsageCount();
        await signup();
    } else {
        updateProgress("Loading session...");
        await navigateToChat();
        await page.waitForTimeout(3000);

        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
            updateProgress("Session expired, re-signing up...");
            await destroySession();
            await signup();
        } else {
            await dismissModals();
            await selectGpt55();
        }
    }

    await dismissModals();
    updateProgress("Sending prompt to GPT-5.5...");
    await sendPrompt(prompt);

    updateProgress("Waiting for response...");
    const response = await extractResponse();

    saveCookies();
    incrementUsageCount();
    _onProgress = null;

    return response;
}

export async function easemateClose() {
    if (browser) {
        saveCookies();
        try { await browser.close(); } catch {}
        browser = null;
        context = null;
        page = null;
        log.info("[EaseMate] Browser closed");
    }
}

export default { askEaseMate, easemateClose, getAccountEmail };
