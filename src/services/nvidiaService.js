// ============================================
// 🏟️ OPEN ARENA - NVIDIA API Service
// Handles communication with NVIDIA NIM API
// ============================================

import CONFIG from '../config/index.js';
import log from '../utils/logger.js';

/**
 * Stream response from NVIDIA API
 */
export async function askLLM(messages, onProgress = null, overrides = {}) {
    const res = await fetch(`${CONFIG.nvidia.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CONFIG.nvidia.apiKey}`
        },
        body: JSON.stringify({
            model: CONFIG.nvidia.model,
            messages,
            temperature: overrides.temperature ?? CONFIG.nvidia.temperature,
            top_p: CONFIG.nvidia.topP,
            max_tokens: overrides.maxTokens ?? CONFIG.nvidia.maxTokens,
            stream: true,
            chat_template_kwargs: overrides.enableThinking ? { enable_thinking: true } : undefined,
            reasoning_budget: overrides.reasoningBudget ?? CONFIG.nvidia.reasoningBudget,
        }),
        signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
        throw new Error(`NVIDIA API ${res.status}: ${await res.text()}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", reasoning = "", content = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;

            try {
                const parsed = JSON.parse(raw);
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.reasoning_content) {
                    reasoning += delta.reasoning_content;
                }
                if (delta.content) {
                    content += delta.content;
                }

                if (onProgress) {
                    onProgress(reasoning, content);
                }
            } catch {
                continue;
            }
        }
    }

    return { reasoning, content: content || "*(no response)*" };
}

/**
 * Search using SearXNG
 */
export async function searchSearXNG(query) {
    try {
        const url = new URL(CONFIG.searxng.url);
        url.searchParams.set("q", query);
        url.searchParams.set("format", "json");
        url.searchParams.set("language", "en");

        const res = await fetch(url.toString(), {
            signal: AbortSignal.timeout(10_000)
        });

        if (!res.ok) {
            throw new Error(`SearXNG returned ${res.status}`);
        }

        const data = await res.json();
        const results = (data.results || []).slice(0, CONFIG.searxng.maxResults);

        if (results.length === 0) return "";

        return results.map((r, i) => 
            `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.content || ""}`
        ).join("\n");
    } catch (err) {
        log.warn("SearXNG search failed:", err.message);
        return "";
    }
}

export default {
    askLLM,
    searchSearXNG
};
