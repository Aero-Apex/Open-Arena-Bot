// ============================================
// 🏟️ OPEN ARENA - Davinci.ai Service
// Handles AI image generation via browser automation
// ============================================

import { chromium } from "playwright";
import axios from "axios";
import crypto from "crypto";
import log from '../utils/logger.js';

const MAILTM_BASE = "https://api.mail.tm";

function generatePassword(length = 6) { return crypto.randomBytes(length).toString('hex').slice(0, length); }
export function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getMailtmDomain() {
    try { const r = await axios.get(`${MAILTM_BASE}/domains`, { timeout: 10000 }); const domains = r.data["hydra:member"] || []; if (domains.length > 0) return domains[0].domain; } catch (e) { log.warn("Failed to get mail.tm domain:", e.message); }
    return null;
}

async function createMailtmAccount() {
    const domain = await getMailtmDomain();
    if (!domain) throw new Error("Mail.tm unreachable.");
    const email = `${crypto.randomBytes(5).toString('hex')}@${domain}`;
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
        } catch (e) { log.warn("Error fetching email:", e.message); }
        await sleep(5000);
    }
    throw new Error("Verification email never arrived.");
}

export async function automateDavinci(prompt, aspect, model, updateStatus) {
    let currentStep = 0;
    const step = async (index) => { currentStep = index; await updateStatus(currentStep); };
    let browser = null;
    const STEPS = ["📧 Email", "🔑 Auth", "📬 Code", "🎨 Canvas", "✍️ Prompt", "🚀 Render", "📥 Download"];

    try {
        await step(0);
        const { email, password: mailPassword } = await createMailtmAccount();
        const sitePassword = generatePassword(6);
        const mailToken = await getMailtmToken(email, mailPassword);

        browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"] });
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" });
        await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
        const page = await context.newPage();
        let pageCrashed = false;
        page.on('crash', () => { pageCrashed = true; });
        page.on('close', () => { pageCrashed = true; });

        async function safeWaitForSelector(selector, options = {}) {
            if (pageCrashed || page.isClosed()) throw new Error("Browser crashed.");
            try { return await page.waitForSelector(selector, { timeout: 20000, ...options }); }
            catch (e) { throw new Error(`UI Element not found: ${selector}`); }
        }

        const preExistingImageUrls = new Set(), newImageUrls = [];
        let generationStarted = false;

        page.on('response', async (response) => {
            const url = response.url(), status = response.status(), contentType = response.headers()['content-type'] || '';
            if (status !== 200 || !contentType.startsWith('image/')) return;
            if (url.includes('.svg') || url.includes('favicon') || url.includes('icon') || url.includes('logo') || url.includes('avatar') || url.includes('thumbnail') || url.includes('emoji') || url.includes('sprite')) return;
            const contentLength = parseInt(response.headers()['content-length'] || '0');
            if (!generationStarted) preExistingImageUrls.add(url);
            else if (!preExistingImageUrls.has(url) && contentLength > 50000) { newImageUrls.push({ url, time: Date.now(), size: contentLength }); log.debug(`[Interceptor] 🎨 Captured NEW generated image: ${url.substring(0, 80)}... (${contentLength} bytes)`); }
        });

        await step(1);
        await page.goto("https://davinci.ai/app", { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(3000);
        await safeWaitForSelector("span:has-text('Continue with email')").then(el => el.click());
        await page.waitForTimeout(2000);
        await safeWaitForSelector("input[placeholder='Enter your mail']").then(el => el.fill(email));
        await page.click("button._auth-modal__primary-btn_ftqie_1");
        await page.waitForTimeout(2000);
        await safeWaitForSelector("input[placeholder='Password']").then(el => el.fill(sitePassword));
        await page.click("button._auth-modal__primary-btn_ftqie_1");
        await page.waitForTimeout(2000);

        await step(2);
        const code = await getLatestEmailCode(mailToken);
        for (let i = 0; i < 6; i++) { const digitInput = await safeWaitForSelector(`input[aria-label='Digit ${i + 1}']`); await digitInput.fill(code[i]); await page.waitForTimeout(300); }
        await page.click("button._auth-modal__primary-btn_ftqie_1");
        await page.waitForTimeout(5000);

        await step(3);
        await page.goto("https://davinci.ai/app/image-generator", { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(5000);
        const existingImgs = await page.evaluate(() => Array.from(document.querySelectorAll('img')).map(img => img.src).filter(src => src && src.startsWith('http')));
        existingImgs.forEach(url => preExistingImageUrls.add(url));
        log.debug(`[Davinci] 📸 Snapshot: ${preExistingImageUrls.size} pre-existing images recorded`);

        try {
            const triggerSelectors = ["button:has-text('Model')", "[class*='model-selector']", "span:has-text('Nano Banana')", "span:has-text('GPT Image')"];
            for (const sel of triggerSelectors) { const el = await page.$(sel); if (el) { await el.click(); await page.waitForTimeout(1500); break; } }
            const targetModelSelectors = [`span:has-text('${model}')`, `button:has-text('${model}')`, `div[role='option']:has-text('${model}')`];
            for (const sel of targetModelSelectors) { try { const el = await page.$(sel); if (el) { await el.click(); await page.waitForTimeout(1000); break; } } catch (e) {} }
        } catch (e) { log.warn(`[Davinci] Model selection issue: ${e.message}`); }

        await step(4);
        const editor = await safeWaitForSelector("div.tiptap.ProseMirror[contenteditable='true']");
        await editor.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);
        await editor.focus();
        for (const char of prompt) await page.keyboard.type(char, { delay: 10 });
        await page.waitForTimeout(1000);

        if (aspect !== "1:1") {
            const dimIcon = await safeWaitForSelector("span._generation-area__dimension-icon_1hvz4_1");
            await dimIcon.click();
            await page.waitForTimeout(1500);
            await page.click(`button._dropdown__item_8jzuk_1:has-text('${aspect}')`);
            await page.waitForTimeout(1000);
        }

        await step(5);
        generationStarted = true;
        newImageUrls.length = 0;
        const genBtn = await safeWaitForSelector("button[data-generate-button='true']");
        await genBtn.click();
        log.info('[Davinci] 🚀 Generate button clicked, waiting for NEW image...');
        await page.waitForTimeout(3000);

        let imageUrl = null;
        const maxWait = 180000, startTime = Date.now();
        let stableCount = 0, lastCount = 0;

        while (Date.now() - startTime < maxWait) {
            const validNewImages = newImageUrls.filter(img => !preExistingImageUrls.has(img.url));
            if (validNewImages.length > 0) { const sorted = validNewImages.sort((a, b) => b.size - a.size); imageUrl = sorted[0].url; log.info(`[Davinci] ✅ Found NEW generated image via network: ${imageUrl.substring(0, 80)}... (${sorted[0].size} bytes)`); await page.waitForTimeout(2000); break; }

            const foundUrl = await page.evaluate((existingUrls) => {
                const containers = document.querySelectorAll('[class*="output"], [class*="result"], [class*="generation"], [class*="image-grid"], [class*="gallery"], [class*="processing-item"], [class*="generated"], [class*="image-item"]');
                let bestImg = null, maxArea = 0;
                for (const container of containers) {
                    const imgs = container.querySelectorAll('img');
                    for (const img of imgs) {
                        if (img.complete && img.naturalWidth > 300 && img.naturalHeight > 300) {
                            const area = img.naturalWidth * img.naturalHeight, src = img.src || img.getAttribute('src');
                            if (area > maxArea && src && !existingUrls.includes(src) && !src.includes('avatar') && !src.includes('logo') && !src.includes('icon') && !src.includes('data:image')) { maxArea = area; bestImg = src; }
                        }
                    }
                }
                return bestImg;
            }, Array.from(preExistingImageUrls));

            if (foundUrl) { imageUrl = foundUrl; log.info(`[Davinci] ✅ Found NEW generated image via DOM: ${imageUrl.substring(0, 80)}...`); await page.waitForTimeout(2000); break; }

            if (newImageUrls.length === lastCount && newImageUrls.length > 0) { stableCount++; if (stableCount >= 3) { const sorted = newImageUrls.sort((a, b) => b.size - a.size); imageUrl = sorted[0].url; log.info(`[Davinci] ✅ Image stabilized: ${imageUrl.substring(0, 80)}...`); break; } } else { stableCount = 0; }
            lastCount = newImageUrls.length;
            await page.waitForTimeout(3000);
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            if (elapsed % 15 === 0) log.info(`[Davinci] ⏳ Still waiting for image... ${elapsed}s elapsed`);
        }

        if (!imageUrl) { try { await page.screenshot({ path: `debug_${Date.now()}.png`, fullPage: true }); log.info('[Davinci] 📸 Debug screenshot saved'); } catch (e) {} throw new Error("Image rendering timed out. No valid generated image was detected."); }

        await step(6);
        let imgBuffer;
        if (imageUrl.startsWith('http')) {
            try { log.info(`[Davinci] 📥 Downloading: ${imageUrl.substring(0, 80)}...`); const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 50 * 1024 * 1024 }); imgBuffer = Buffer.from(imgResponse.data, 'binary'); log.info(`[Davinci] ✅ Downloaded: ${imgBuffer.length} bytes`); } catch (e) { log.error(`[Davinci] Axios download failed: ${e.message}`); }
        }
        if (!imgBuffer) {
            try { log.info('[Davinci] Falling back to browser fetch...'); const buffer = await page.evaluate(async (url) => { const response = await fetch(url); const blob = await response.blob(); const arrayBuffer = await blob.arrayBuffer(); return Array.from(new Uint8Array(arrayBuffer)); }, imageUrl); imgBuffer = Buffer.from(buffer); log.info(`[Davinci] ✅ Browser fetch: ${imgBuffer.length} bytes`); } catch (e) { log.error(`[Davinci] Browser fetch failed: ${e.message}`); throw new Error("Could not download image via any method."); }
        }

        const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
        log.info(`[Davinci] 🎉 Generation complete! Size: ${imgBuffer.length} bytes`);
        return { imgBuffer, fileName: `generated_${Date.now()}.${ext}` };

    } catch (e) { await updateStatus(currentStep, e.message); log.error('[Davinci] Automation error:', e); throw e; } finally { if (browser) await browser.close().catch(() => {}); }
}

export default { automateDavinci, sleep };
