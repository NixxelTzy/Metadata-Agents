/**
 * lib/deepseek.ts
 * DeepSeek AI client untuk chat dan analisis gambar.
 * API key dibaca dari DEEPSEEK_API_KEY environment variable.
 */

import { getDeepSeekApiKey } from "@/lib/config";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
// deepseek-chat = DeepSeek-V3 (supports vision via image_url)
const CHAT_MODEL = "deepseek-chat";

export interface DeepSeekMessage {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface DeepSeekOptions {
  temperature?: number;
  max_tokens?: number;
}

export interface DeepSeekResult {
  text: string;
  modelUsed: string;
}

/**
 * Panggil DeepSeek API.
 * Mendukung text-only dan multimodal (image + text).
 */
export async function callDeepSeek(
  messages: DeepSeekMessage[],
  opts: DeepSeekOptions = {}
): Promise<DeepSeekResult> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    throw new Error(
      "DeepSeek API key tidak dikonfigurasi. Set DEEPSEEK_API_KEY di environment variables."
    );
  }

  const { temperature = 0.3, max_tokens = 4096 } = opts;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature,
      max_tokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    let errorMsg = `DeepSeek API error (${response.status})`;
    try {
      const errBody = await response.json() as { error?: { message?: string } };
      if (errBody?.error?.message) errorMsg += `: ${errBody.error.message}`;
    } catch { /* ignore parse error */ }

    // Pesan error yang lebih informatif per status code
    if (response.status === 401) {
      throw new Error("DeepSeek API key tidak valid atau expired (401). Pastikan DEEPSEEK_API_KEY sudah benar.");
    }
    if (response.status === 402) {
      throw new Error("Saldo DeepSeek habis (402). Top up di platform.deepseek.com.");
    }
    if (response.status === 429) {
      throw new Error("Rate limit DeepSeek tercapai (429). Coba lagi sebentar.");
    }
    throw new Error(errorMsg);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Respons DeepSeek kosong atau tidak valid.");
  }

  return {
    text,
    modelUsed: data.model ?? CHAT_MODEL,
  };
}

/**
 * Convenience: single text message ke DeepSeek
 */
export async function askDeepSeek(
  userMessage: string,
  systemPrompt?: string,
  opts: DeepSeekOptions = {}
): Promise<DeepSeekResult> {
  const messages: DeepSeekMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userMessage });
  return callDeepSeek(messages, opts);
}
