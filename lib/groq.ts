/**
 * lib/groq.ts
 * Groq AI client — ultra-fast inference.
 * API key dibaca dari GROQ_API_KEY environment variable.
 */

import { getGroqApiKeys } from "@/lib/config";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const CHAT_MODEL   = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export interface GroqMessage {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface GroqOptions {
  temperature?: number;
  max_tokens?: number;
  vision?: boolean;
}

export interface GroqUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GroqResult {
  text: string;
  modelUsed: string;
  usage: GroqUsage;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Retry a single key up to maxAttempts with exponential backoff on 429
async function callGroqKey(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  temperature: number,
  max_tokens: number,
  maxAttempts = 3
): Promise<GroqResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream: false }),
    });

    if (!response.ok) {
      let errorMsg = `Groq API error (${response.status})`;
      try {
        const errBody = await response.json() as { error?: { message?: string } };
        if (errBody?.error?.message) errorMsg += `: ${errBody.error.message}`;
      } catch { /* ignore */ }

      if (response.status === 401) throw new Error("Groq API key tidak valid (401). Cek GROQ_API_KEY.");
      if (response.status === 413) throw new Error("Request terlalu besar (413). Kurangi ukuran gambar.");
      if (response.status === 429) {
        if (attempt < maxAttempts) {
          // Exponential backoff: 2s, 4s, 8s
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`[Groq] 429 rate limit. Waiting ${backoffMs}ms before retry ${attempt + 1}/${maxAttempts}...`);
          await sleep(backoffMs);
          continue;
        }
        throw new Error("429"); // Signal to caller to try next key
      }
      throw new Error(errorMsg);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Respons Groq kosong atau tidak valid.");

    return {
      text,
      modelUsed: data.model ?? model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  }
  throw new Error("429");
}

export async function callGroq(
  messages: GroqMessage[],
  opts: GroqOptions = {}
): Promise<GroqResult> {
  const apiKeys = getGroqApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("Groq API key tidak dikonfigurasi. Set GROQ_API_KEY di environment variables.");
  }

  const { temperature = 0.3, max_tokens = 8192, vision = false } = opts;
  const model = vision ? VISION_MODEL : CHAT_MODEL;

  let lastError: Error | null = null;

  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const result = await callGroqKey(apiKeys[i]!, model, messages, temperature, max_tokens);
      return result;
    } catch (err: any) {
      if (err.message === "429") {
        lastError = new Error("Rate limit Groq tercapai (429) pada semua key. Tunggu 30 detik dan coba lagi.");
        if (i < apiKeys.length - 1) {
          console.log(`[Groq] Key ${i + 1} exhausted. Rotating to key ${i + 2}...`);
          // Brief pause before trying next key
          await sleep(1500);
          continue;
        }
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error("Terjadi kesalahan pada Groq API.");
}

export async function askGroq(
  userMessage: string,
  systemPrompt?: string,
  opts: GroqOptions = {}
): Promise<GroqResult> {
  const messages: GroqMessage[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userMessage });
  return callGroq(messages, opts);
}
