import { chromium } from "playwright";
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import path from "path";
import CONFIG from "../config/index.js";
import log from "../utils/logger.js";

// ─── mail.tm helpers (shared pattern with davinciService) ───────────────

const MAILTM_BASE = "https://api.mail.tm";

function generatePassword(length = 6) {
    return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMailtmDomain() {
    try {
        const r = await axios.get(`${MAILTM_BASE}/domains`, { timeout: 10000 });
        const domains = r.data["hydra:member"] || [];
        if (domains.length > 0) return domains[0].domain;
    } catch (e) {
        log.warn("Failed to get mail.tm domain:", e.message);
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
    for (let i = 0; i < 24; i++) {
        try {
            const r = await axios.get(`${MAILTM_BASE}/messages`, { headers, timeout: 10000 });
            const messages = r.data["hydra:member"] || [];
            if (messages.length > 0) {
                const r2 = await axios.get(`${MAILTM_BASE}/messages/${messages[0].id}`, { headers });
                const content = (r2.data.text || "") + (r2.data.html ? r2.data.html[0] : "");
                const match = content.match(/\b(\d{6})\b/);
                if (match) return match[1];
            }
        } catch (e) {
            log.warn("Error fetching email:", e.message);
        }
        await sleep(5000);
    }
    throw new Error("Verification email never arrived.");
}

// ─── Turnstile solver ──────────────────────────────────────────────────

async function solveTurnstileAntiCaptcha(page) {
    const ac = await import("@antiadmin/anticaptchaofficial");
    ac.default.setAPIKey(CONFIG.anticaptcha.apiKey);
    ac.default.setSoftId(0);

    const params = await interceptTurnstile(page);
    log.info(`[EaseMate] Turnstile params extracted: sitekey=${params.websiteKey}`);

    const token = await ac.default.solveTurnstileProxyless(
        params.websiteURL,
        params.websiteKey,
        params.action,
        params.cData,
        params.chlPageData
    );

    await page.evaluate((t) => { window.cfCallback(t); }, token);
    log.info("[EaseMate] Turnstile solved via Anti-Captcha");
}

async function solveTurnstileCapsolver(page) {
    const CAPSOLVER_API = "https://api.capsolver.com";
    const clientKey = CONFIG.anticaptcha.capsolverKey;

    const params = await interceptTurnstile(page);
    log.info(`[EaseMate] Turnstile params extracted: sitekey=${params.websiteKey}`);

    const taskResp = await axios.post(`${CAPSOLVER_API}/createTask`, {
        clientKey,
        task: {
            type: "AntiTurnstileTaskProxyLess",
            websiteURL: params.websiteURL,
            websiteKey: params.websiteKey,
        },
    });

    const taskId = taskResp.data.taskId;
    if (!taskId) throw new Error(`Capsolver createTask failed: ${JSON.stringify(taskResp.data)}`);

    let token = null;
    for (let i = 0; i < 30; i++) {
        await sleep(2000);
        const resultResp = await axios.post(`${CAPSOLVER_API}/getTaskResult`, { clientKey, taskId });
        if (resultResp.data.status === "ready") {
            token = resultResp.data.solution?.token;
            break;
        }
    }

    if (!token) throw new Error("Capsolver timed out solving Turnstile");

    await page.evaluate((t) => { window.cfCallback(t); }, token);
    log.info("[EaseMate] Turnstile solved via Capsolver");
}

async function interceptTurnstile(page) {
    let params = null;
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        await page.goto(CONFIG.easemate.url, { waitUntil: "domcontentloaded", timeout: 45000 });

        await page.evaluate(() => {
            window.turnstile = new Proxy(window.turnstile, {
                get(target, prop) {
                    if (prop === "render") {
                        return function (a, b) {
                            const p = {
                                websiteURL: window.location.href,
                                websiteKey: b.sitekey,
                                action: b.action,
                                cData: b.cData,
                                chlPageData: b.chlPageData,
                                userAgent: navigator.userAgent,
                            };
                            window.params = p;
                            window.cfCallback = b.callback;
                            return target.render.apply(this, arguments);
                        };
                    }
                    return target[prop];
                },
            });
        });

        params = await page.evaluate(() => {
            return new Promise((resolve) => {
                setTimeout(() => resolve(window.params || null), 5000);
            });
        });

        if (params) break;
        log.info(`[EaseMate] Retrying Turnstile interception (${attempt + 1}/${maxRetries})...`);
        await sleep(3000);
    }

    if (!params) throw new Error("Failed to intercept Turnstile after retries");
    return params;
}

// ─── Browser & session management ──────────────────────────────────────

let browser = null;
let context = null;
let page = null;
let _account = null;

const SESSION_PATH = path.resolve(CONFIG.easemate.sessionDir, "easemate_cookies.json");

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
        const cookies = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
        if (!Array.isArray(cookies) || cookies.length === 0) return false;
        await ctx.addCookies(cookies);
        log.info("[EaseMate] Loaded saved session cookies");
        return true;
    } catch {
        return false;
    }
}

async function destroySession() {
    if (fs.existsSync(SESSION_PATH)) {
        fs.unlinkSync(SESSION_PATH);
    }
    _account = null;
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
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    page = await context.newPage();

    let pageCrashed = false;
    page.on("crash", () => { pageCrashed = true; });
    page.on("close", () => { pageCrashed = true; });

    page.on("response", (response) => {
        if (response.url().includes("turnstile") && response.status() === 200) {
            log.debug("[EaseMate] Turnstile response intercepted");
        }
    });

    log.info("[EaseMate] Browser launched");
}

async function navigateToChat() {
    await page.goto(CONFIG.easemate.url, { waitUntil: "networkidle", timeout: 45000 });
}

function isLoggedIn() {
    return page.evaluate(() => {
        const loginBtn = document.querySelector('span:has-text("Log In")');
        return !loginBtn;
    }).catch(() => false);
}

// ─── Signup flow ────────────────────────────────────────────────────────

async function signup() {
    log.info("[EaseMate] Starting signup flow...");

    const account = await createMailtmAccount();
    _account = account;
    log.info(`[EaseMate] Temp email: ${account.email}`);

    const sitePassword = generatePassword(8);
    const mailToken = await getMailtmToken(account.email, account.password);

    // Navigate & intercept Turnstile
    const solver = CONFIG.anticaptcha.apiKey
        ? solveTurnstileAntiCaptcha
        : CONFIG.anticaptcha.capsolverKey
            ? solveTurnstileCapsolver
            : null;

    if (!solver) {
        throw new Error("No captcha solver configured (ANTICAPTCHA_API_KEY or CAPSOLVER_API_KEY required)");
    }

    await solver(page);

    // Click through signup modal
    try {
        await safeClick("span:has-text('Log In')", 5000);
        await page.waitForTimeout(2000);
        await safeClick("span:has-text('Continue with Email')", 5000);
        await page.waitForTimeout(2000);
        await safeClick("a:has-text('Sign up now')", 5000);
        await page.waitForTimeout(2000);
    } catch (e) {
        log.warn("[EaseMate] Modal navigation issue, state may vary:", e.message);
    }

    // Fill form
    try {
        await safeFill("#form_item_email", account.email);
        await safeFill("#form_item_password", sitePassword);
    } catch (e) {
        throw new Error(`Could not fill signup form: ${e.message}`);
    }

    // Click create account
    await safeClick("button:has-text('Create Account')", 5000);
    log.info("[EaseMate] Account created, waiting for verification email...");

    // Verification code
    const code = await getLatestEmailCode(mailToken);
    log.info(`[EaseMate] Verification code received: ${code}`);

    for (let i = 0; i < 6; i++) {
        try {
            const input = await page.waitForSelector(`input[aria-label='Digit ${i + 1}']`, { timeout: 5000 });
            await input.fill(code[i]);
        } catch {
            // Try generic input fields
            const inputs = await page.$$("input[type='text']");
            if (inputs.length >= 6 && inputs[i]) {
                await inputs[i].fill(code[i]);
            } else {
                throw new Error("Could not find verification code inputs");
            }
        }
        await page.waitForTimeout(200);
    }

    await page.waitForTimeout(3000);

    // Navigate to chat page after signup
    await navigateToChat();
    await page.waitForTimeout(3000);

    // Select GPT-5.5 model
    await selectGpt55();

    saveCookies();
    log.info("[EaseMate] Signup complete, session saved");
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
        // Hover/click the model selector showing "Gemini 2.0 Flash"
        const modelTrigger = await page.waitForSelector("span:has-text('Gemini 2.0 Flash')", { timeout: 10000 });
        await modelTrigger.hover();
        await page.waitForTimeout(1000);
        await modelTrigger.click();
        await page.waitForTimeout(1500);

        // Select GPT-5.5 from dropdown
        const gpt55 = await page.waitForSelector("span:has-text('GPT-5.5')", { timeout: 5000 });
        await gpt55.click();
        await page.waitForTimeout(1500);

        log.info("[EaseMate] Model set to GPT-5.5");
    } catch (e) {
        log.warn("[EaseMate] Model selection failed, may already be correct:", e.message);
    }
}

// ─── Ask flow ──────────────────────────────────────────────────────────

async function sendPrompt(text) {
    // Try finding the chat input — common selectors
    const selectors = [
        "textarea",
        "div[contenteditable='true']",
        "input[placeholder*='message']",
        "input[placeholder*='ask']",
        "input[placeholder*='question']",
        "div[role='textbox']",
    ];

    let input = null;
    for (const sel of selectors) {
        input = await page.$(sel);
        if (input) break;
    }

    if (!input) {
        // Fallback: find any large input field
        const allInputs = await page.$$("input, textarea, div[contenteditable]");
        for (const el of allInputs) {
            const box = await el.boundingBox();
            if (box && box.width > 200) {
                input = el;
                break;
            }
        }
        if (!input) throw new Error("Could not find chat input field");
    }

    const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
    const isContentEditable = await input.evaluate((el) => el.isContentEditable);

    if (isContentEditable || tagName === "div") {
        await input.click();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);
        await input.focus();
        for (const char of text) {
            await page.keyboard.type(char, { delay: 5 });
        }
    } else {
        await input.fill(text);
    }

    await page.waitForTimeout(500);

    // Try clicking send button
    const sendSelectors = [
        "button[type='submit']",
        "svg[aria-label='Send']",
        "button:has(svg)",
        "button:has-text('Send')",
        "button:has-text('→')",
    ];

    let sent = false;
    for (const sel of sendSelectors) {
        const btn = await page.$(sel);
        if (btn) {
            await btn.click();
            sent = true;
            break;
        }
    }

    // If no send button found, press Enter
    if (!sent) {
        if (tagName === "textarea") {
            await page.keyboard.press("Enter");
        } else {
            await page.keyboard.press("ControlOrMeta+Enter");
        }
    }

    log.info("[EaseMate] Prompt sent, waiting for response...");
}

async function extractResponse() {
    const maxWait = 120000;
    const startTime = Date.now();
    let lastText = "";
    let stableCount = 0;

    while (Date.now() - startTime < maxWait) {
        const text = await page.evaluate(() => {
            const messages = document.querySelectorAll('[class*="message"], [class*="chat-msg"], [class*="assistant"], [class*="bot"], [class*="response"]');
            if (messages.length === 0) return "";

            // Get the last message that looks like an AI response
            const lastMsg = messages[messages.length - 1];
            const textEl = lastMsg.querySelector("p, span, div") || lastMsg;
            return textEl.textContent?.trim() || "";
        });

        if (text && text !== lastText) {
            lastText = text;
            stableCount = 0;
        } else if (text && text === lastText) {
            stableCount++;
        }

        // Stable for 2 seconds → done
        if (stableCount >= 2 && text.length > 0) {
            return text;
        }

        await sleep(1000);
    }

    if (lastText) return lastText;
    throw new Error("EaseMate did not return a response within the timeout");
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Ask GPT-5.5 on EaseMate.ai a question.
 * Manages browser lifecycle and session cookies automatically.
 */
export async function askEaseMate(prompt) {
    await initBrowser();

    const hasCookies = await loadCookies(context);
    if (!hasCookies) {
        await signup();
    } else {
        await navigateToChat();
        await page.waitForTimeout(3000);

        // Check if still logged in
        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
            log.info("[EaseMate] Session expired, re-signing up...");
            await destroySession();
            await signup();
        } else {
            await selectGpt55();
        }
    }

    // Clear any existing conversation / input
    try {
        const clearBtns = await page.$$("button:has-text('New Chat'), button:has-text('Clear'), button:has-text('Reset')");
        if (clearBtns.length > 0) {
            await clearBtns[0].click();
            await page.waitForTimeout(2000);
        }
    } catch { /* ignore */ }

    await sendPrompt(prompt);
    const response = await extractResponse();

    saveCookies();

    return response;
}

/**
 * Close browser — call on bot shutdown.
 */
export async function easemateClose() {
    if (browser) {
        saveCookies();
        try {
            await browser.close();
        } catch {}
        browser = null;
        context = null;
        page = null;
        log.info("[EaseMate] Browser closed");
    }
}

export default { askEaseMate, easemateClose, getAccountEmail };
